const jwt = require("jsonwebtoken");
const { FILE_COOKIE_NAME, verifyFileToken } = require("../utils/fileAccessToken");

/*
 * Gate for the uploaded-file static mount.
 *
 * Before this existed the uploads directory was served by express.static with
 * no credential of any kind, so lead documents, KYC paperwork and profile
 * photos were readable by anyone who had the URL. A file is now released only
 * to one of three credentials, in the order a real request is most likely to
 * carry them:
 *
 *   1. a staff bearer token  - API and mobile clients;
 *   2. the file-access cookie - <img>/<a> on a same-origin page after login;
 *   3. a per-URL ?t= token    - public share links, which have no session.
 */

const parseCookies = (header) => {
  const jar = {};
  String(header || "")
    .split(";")
    .forEach((part) => {
      const index = part.indexOf("=");
      if (index < 1) return;
      const key = part.slice(0, index).trim();
      if (!key) return;
      try {
        jar[key] = decodeURIComponent(part.slice(index + 1).trim());
      } catch {
        jar[key] = part.slice(index + 1).trim();
      }
    });
  return jar;
};

// Returns the staff account id from a bearer token, or "" when there is none.
const staffIdFromBearer = (req) => {
  const header = String(req.headers.authorization || "");
  if (!header.startsWith("Bearer ")) return "";
  try {
    const decoded = jwt.verify(header.slice(7).trim(), process.env.JWT_SECRET);
    // A staff access token carries no scope; scoped tokens are handled below.
    return decoded.scope ? "" : String(decoded.id || decoded._id || decoded.userId || "");
  } catch {
    return "";
  }
};

const hasValidStaffToken = (req) => Boolean(staffIdFromBearer(req));

// The account behind the file-session cookie (no path claim), if any.
const cookieUserId = (token) => {
  try {
    const decoded = jwt.verify(String(token || ""), process.env.JWT_SECRET);
    if (decoded?.scope !== "files" || decoded.p) return "";
    return String(decoded.id || "");
  } catch {
    return "";
  }
};

exports.requireFileAccess = async (req, res, next) => {
  // req.path here is relative to the mount, e.g. "/chat/1699-abc.png".
  const requestedPath = String(req.path || "").replace(/^\/+/, "");
  const cookies = parseCookies(req.headers.cookie);
  const docs = require("../services/documentAccess.service");

  // Coworking client documents: Admin or an authorised manager only, never a
  // per-URL token (requirements 16 Oct 2026, section 09).
  if (docs.isProtectedClientDocument(requestedPath)) {
    try {
      const userId = staffIdFromBearer(req) || cookieUserId(cookies[FILE_COOKIE_NAME]);
      const user = await docs.loadUserForFileAccess(userId);
      if (!user) return res.status(401).json({ message: "Not authorized to access this file" });
      if (!docs.canDownloadClientDocuments(user)) {
        return res.status(403).json({ message: "Only the Admin or an authorised manager can download client documents" });
      }
      await docs.logDownload({ user, path: requestedPath, req });
      return next();
    } catch {
      return res.status(500).json({ message: "Could not check file access" });
    }
  }

  if (hasValidStaffToken(req)) return next();

  if (cookies[FILE_COOKIE_NAME] && verifyFileToken(cookies[FILE_COOKIE_NAME], requestedPath)) {
    return next();
  }

  const urlToken = req.query?.t;
  if (urlToken && verifyFileToken(urlToken, requestedPath)) return next();

  return res.status(401).json({ message: "Not authorized to access this file" });
};

exports.parseCookies = parseCookies;
