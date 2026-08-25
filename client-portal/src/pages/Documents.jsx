import { useEffect, useState } from "react";
import { FileText, UploadCloud } from "lucide-react";
import { getMyDocuments, submitMyDocument } from "../services/dataService";
import { Button, Card, EmptyState, Skeleton } from "../components/ui";
import { formatDate } from "../utils/format";

const DOCUMENT_CATEGORIES = [
  { value: "KYC", label: "KYC" },
  { value: "AGREEMENT", label: "Agreement" },
  { value: "ID_PROOF", label: "ID Proof" },
  { value: "OTHER", label: "Other" },
];

const Documents = () => {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [formData, setFormData] = useState({ name: "", category: "KYC", file: null });
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const load = () => {
    setLoading(true);
    setError("");
    getMyDocuments()
      .then(setDocuments)
      .catch((fetchError) => setError(fetchError?.response?.data?.message || fetchError?.message || "Failed to load documents"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, []);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!formData.file) return;

    setSubmitting(true);
    setError("");
    setSuccess("");
    try {
      await submitMyDocument({
        file: formData.file,
        name: formData.name.trim() || formData.file.name,
        category: formData.category,
      });
      setFormData({ name: "", category: "KYC", file: null });
      event.target.reset();
      setSuccess("Document submitted successfully");
      await getMyDocuments().then(setDocuments);
    } catch (submitError) {
      setError(submitError?.response?.data?.message || submitError?.message || "Failed to submit document");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Documents</h1>
          <p className="text-sm text-slate-500">View shared documents and submit new documents to the coworking team.</p>
        </div>
        <Button variant="secondary" onClick={load} disabled={loading || submitting}>
          Refresh
        </Button>
      </div>

      {error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
          {error}
        </div>
      ) : null}
      {success ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
          {success}
        </div>
      ) : null}

      <Card>
        <div className="mb-4 flex items-center gap-2">
          <div className="rounded-xl bg-brand-50 p-2 text-brand-700">
            <UploadCloud aria-hidden="true" size={18} />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-900">Submit Document</h2>
            <p className="text-xs text-slate-500">Upload PDF, image, Word, or Excel documents for your account.</p>
          </div>
        </div>

        <form className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_12rem]" onSubmit={handleSubmit}>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-bold uppercase tracking-wide text-slate-400">Document name</span>
            <input
              value={formData.name}
              onChange={(event) => setFormData((prev) => ({ ...prev, name: event.target.value }))}
              disabled={submitting}
              placeholder="Example: GST certificate"
              className="h-10 rounded-xl border border-slate-300 bg-white px-3 text-sm outline-none focus:border-brand-500"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-bold uppercase tracking-wide text-slate-400">Category</span>
            <select
              value={formData.category}
              onChange={(event) => setFormData((prev) => ({ ...prev, category: event.target.value }))}
              disabled={submitting}
              className="h-10 rounded-xl border border-slate-300 bg-white px-3 text-sm outline-none focus:border-brand-500"
            >
              {DOCUMENT_CATEGORIES.map((category) => (
                <option key={category.value} value={category.value}>
                  {category.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 sm:col-span-2">
            <span className="text-xs font-bold uppercase tracking-wide text-slate-400">File</span>
            <input
              type="file"
              accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx"
              onChange={(event) => setFormData((prev) => ({ ...prev, file: event.target.files?.[0] || null }))}
              disabled={submitting}
              className="block w-full rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3 py-3 text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-600 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-white hover:border-brand-300"
            />
          </label>
          <div className="sm:col-span-2">
            <Button type="submit" disabled={!formData.file || submitting}>
              <UploadCloud aria-hidden="true" size={16} />
              {submitting ? "Submitting..." : "Submit Document"}
            </Button>
          </div>
        </form>
      </Card>

      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-14" />
          <Skeleton className="h-14" />
        </div>
      ) : documents.length === 0 ? (
        <EmptyState title="No documents shared yet" description="Submitted and shared documents will appear here." />
      ) : (
        <div className="space-y-2">
          {documents.map((doc, idx) => (
            <Card key={idx} className="flex items-center justify-between gap-3">
              <a href={doc.fileUrl} target="_blank" rel="noreferrer" className="flex min-w-0 items-center gap-3 text-brand-700 hover:underline">
                <FileText aria-hidden="true" size={16} className="shrink-0" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold">{doc.name}</p>
                  <p className="text-xs text-slate-400">{doc.sourceLabel} · {doc.category} · {formatDate(doc.uploadedAt)}</p>
                </div>
              </a>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default Documents;
