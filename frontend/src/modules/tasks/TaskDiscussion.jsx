import React, { useRef, useState } from "react";
import { FileText, History, MessageSquare, Paperclip, Send, Trash2, X } from "lucide-react";
import { addTaskAttachments, addTaskComment, deleteTaskAttachment, deleteTaskComment } from "../../services/taskService";
import { uploadFile } from "../../services/uploadService";

const UPLOAD_CATEGORY = "task-attachments";
const MAX_FILES_PER_POST = 5;

const refId = (value) => String(value?._id || value || "");
const formatWhen = (value) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
};
const formatSize = (bytes) => {
  const n = Number(bytes) || 0;
  if (n >= 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  if (n >= 1024) return `${Math.round(n / 1024)} KB`;
  return n ? `${n} B` : "";
};

const ACTIVITY_TEXT = {
  CREATED: () => "created the task",
  STATUS_CHANGED: (detail) => `changed status: ${detail}`,
  REASSIGNED: () => "reassigned the task",
  COMMENTED: (detail) => (detail ? `commented with ${detail}` : "commented"),
  FILE_ADDED: (detail) => `attached ${detail}`,
  FILE_REMOVED: (detail) => `removed ${detail}`,
};

const FileChip = ({ file, onRemove }) => (
  <span className="tw-file-chip">
    <a href={file.url} target="_blank" rel="noreferrer"><FileText size={14} /><span>{file.name || "File"}</span>{file.size ? <small>{formatSize(file.size)}</small> : null}</a>
    {onRemove ? <button type="button" onClick={onRemove} aria-label={`Remove ${file.name || "file"}`}><X size={12} /></button> : null}
  </span>
);

const uploadAll = async (files) => {
  const uploaded = [];
  for (const file of files) {
    const result = await uploadFile(file, UPLOAD_CATEGORY);
    uploaded.push({ url: result.url, name: result.fileName || file.name, mimeType: result.mimeType || file.type, size: result.size || file.size });
  }
  return uploaded;
};

export default function TaskDiscussion({ task, currentUserId, canModerate = false, onTaskChange, onError }) {
  const [draft, setDraft] = useState("");
  const [pendingFiles, setPendingFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const commentFileInput = useRef(null);
  const taskFileInput = useRef(null);

  const comments = Array.isArray(task?.comments) ? task.comments : [];
  const attachments = Array.isArray(task?.attachments) ? task.attachments : [];
  const activity = Array.isArray(task?.activity) ? [...task.activity].reverse() : [];
  const canRemove = (item) => canModerate || refId(item.author || item.uploadedBy) === currentUserId;

  const run = async (work, fallback) => {
    setBusy(true);
    try {
      const updated = await work();
      if (updated?._id) onTaskChange?.(updated);
      return true;
    } catch (error) {
      onError?.(error?.response?.data?.message || error?.message || fallback);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const pickCommentFiles = (event) => {
    const chosen = Array.from(event.target.files || []);
    event.target.value = "";
    setPendingFiles((previous) => [...previous, ...chosen].slice(0, MAX_FILES_PER_POST));
  };

  const postComment = async (event) => {
    event.preventDefault();
    const body = draft.trim();
    if ((!body && !pendingFiles.length) || busy) return;
    const ok = await run(async () => {
      const files = await uploadAll(pendingFiles);
      return addTaskComment(task._id, { body, attachments: files });
    }, "Couldn't post the comment");
    if (ok) {
      setDraft("");
      setPendingFiles([]);
    }
  };

  const attachToTask = async (event) => {
    const chosen = Array.from(event.target.files || []).slice(0, MAX_FILES_PER_POST);
    event.target.value = "";
    if (!chosen.length) return;
    await run(async () => addTaskAttachments(task._id, await uploadAll(chosen)), "Couldn't attach the file");
  };

  return (
    <div className="tw-discussion">
      <div className="tw-detail-divider" />
      <div className="tw-detail-subtasks-heading">
        <h3><Paperclip size={16} />Files <span>({attachments.length})</span></h3>
        <button className="tw-secondary-button" type="button" disabled={busy} onClick={() => taskFileInput.current?.click()}><Paperclip size={15} />Attach file</button>
        <input ref={taskFileInput} type="file" multiple hidden onChange={attachToTask} aria-label="Attach files to this task" />
      </div>
      {attachments.length ? (
        <div className="tw-file-list">
          {attachments.map((file) => (
            <FileChip key={file._id || file.url} file={file} onRemove={canRemove(file) ? () => run(() => deleteTaskAttachment(task._id, file._id), "Couldn't remove the file") : null} />
          ))}
        </div>
      ) : <p className="tw-discussion-empty">No files yet. Attach briefs, references or the finished work.</p>}

      <div className="tw-detail-divider" />
      <div className="tw-detail-subtasks-heading">
        <h3><MessageSquare size={16} />Comments &amp; updates <span>({comments.length})</span></h3>
        <button className={`tw-secondary-button ${showHistory ? "is-active" : ""}`} type="button" onClick={() => setShowHistory((value) => !value)}><History size={15} />History</button>
      </div>

      {showHistory ? (
        <ol className="tw-history">
          {activity.length ? activity.map((entry, index) => (
            <li key={entry._id || index}>
              <strong>{entry.actor?.name || "Someone"}</strong> {(ACTIVITY_TEXT[entry.action] || (() => entry.action))(entry.detail)}
              <time>{formatWhen(entry.at)}</time>
            </li>
          )) : <li>No history recorded yet.</li>}
        </ol>
      ) : null}

      <div className="tw-comments">
        {comments.length ? comments.map((comment) => (
          <article key={comment._id} className={`tw-comment ${refId(comment.author) === currentUserId ? "is-mine" : ""}`}>
            <header>
              <strong>{comment.author?.name || "Someone"}</strong>
              <time>{formatWhen(comment.createdAt)}</time>
              {canRemove(comment) ? <button type="button" className="tw-comment-delete" disabled={busy} onClick={() => run(() => deleteTaskComment(task._id, comment._id), "Couldn't delete the comment")} aria-label="Delete comment"><Trash2 size={13} /></button> : null}
            </header>
            {comment.body ? <p>{comment.body}</p> : null}
            {comment.attachments?.length ? <div className="tw-file-list">{comment.attachments.map((file) => <FileChip key={file._id || file.url} file={file} />)}</div> : null}
          </article>
        )) : <p className="tw-discussion-empty">No comments yet. Post a progress update or ask a question.</p>}
      </div>

      <form className="tw-comment-form" onSubmit={postComment}>
        <textarea rows={2} value={draft} maxLength={4000} onChange={(event) => setDraft(event.target.value)} placeholder="Write an update or question…" aria-label="Comment" />
        {pendingFiles.length ? (
          <div className="tw-file-list">
            {pendingFiles.map((file, index) => <FileChip key={`${file.name}-${index}`} file={{ name: file.name, size: file.size, url: "#" }} onRemove={() => setPendingFiles((previous) => previous.filter((_, i) => i !== index))} />)}
          </div>
        ) : null}
        <div className="tw-comment-actions">
          <button type="button" className="tw-secondary-button" disabled={busy || pendingFiles.length >= MAX_FILES_PER_POST} onClick={() => commentFileInput.current?.click()}><Paperclip size={15} />Add file</button>
          <input ref={commentFileInput} type="file" multiple hidden onChange={pickCommentFiles} aria-label="Add files to the comment" />
          <button type="submit" className="tw-primary-button" disabled={busy || (!draft.trim() && !pendingFiles.length)}><Send size={14} />{busy ? "Posting…" : "Post"}</button>
        </div>
      </form>
    </div>
  );
}
