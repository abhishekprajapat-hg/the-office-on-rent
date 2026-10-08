import { useState } from "react";
import { getNameInitials, getProfileImageUrl } from "./avatarUtils";

/*
 * What goes inside any round avatar in the app: the person's profile photo
 * when they have one, otherwise their initials (or a fallback icon).
 * The caller keeps its own circle (size, colours); the photo just fills it.
 * A broken or deleted photo quietly falls back to the initials.
 *
 * The photo sits in a square box of its own rather than being handed straight
 * to the caller's circle. Uploaded photos are whatever shape the camera gave
 * them - a 289x512 portrait is normal - and relying on the caller's box being
 * square left a tall photo squeezed into the avatar, visibly stretched. The
 * box fixes its own aspect ratio and clips, so the photo is cropped to the
 * middle instead of being distorted however the caller's layout happens to
 * size things.
 */
const AvatarFace = ({ user, src, name, fallback = null, initials, alt = "" }) => {
  const imageUrl = String(src ?? getProfileImageUrl(user)).trim();
  const [failedUrl, setFailedUrl] = useState("");

  if (imageUrl && failedUrl !== imageUrl) {
    return (
      <span
        style={{
          display: "block",
          width: "100%",
          aspectRatio: "1 / 1",
          overflow: "hidden",
          borderRadius: "inherit",
        }}
      >
        <img
          src={imageUrl}
          alt={alt}
          loading="lazy"
          draggable={false}
          onError={() => setFailedUrl(imageUrl)}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            objectPosition: "center",
            display: "block",
          }}
        />
      </span>
    );
  }

  const text = initials ?? getNameInitials(name ?? user?.name);
  return text || fallback || null;
};

export default AvatarFace;
