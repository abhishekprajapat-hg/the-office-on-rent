import { useState } from "react";
import { Ban, FileText, PlayCircle, RefreshCw, Trash2 } from "lucide-react";
import { Badge, Button, IconButton, Input, Select } from "../../../components/ui";
import { DetailDrawer, StatusBadge } from "../../../components/crm";
import {
  activateContract,
  addContractDocument,
  removeContractDocument,
  renewContract,
  terminateContract,
} from "../../../services/coworkingContractService";
import { uploadFile } from "../../../services/uploadService";
import { usePermissions } from "../../../context/usePermissions";
import { formatCurrency, formatDate } from "../../../utils/format";
import { toErrorMessage } from "../../../utils/errorMessage";
import { CONTRACT_DOCUMENT_CATEGORIES } from "../../../constants/coworkingBilling";

const ContractDetailDrawer = ({ contract, onClose, onChanged }) => {
  const { can } = usePermissions();
  const canUpdate = can("contracts.update");
  const canRenew = can("contracts.renew");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [showRenew, setShowRenew] = useState(false);
  const [renewEndDate, setRenewEndDate] = useState("");
  const [renewRent, setRenewRent] = useState("");
  const [docCategory, setDocCategory] = useState("AGREEMENT");
  const [uploading, setUploading] = useState(false);

  if (!contract) return null;

  const run = async (actionFn) => {
    setBusy(true);
    setError(null);
    try {
      const updated = await actionFn();
      onChanged(updated);
      setShowRenew(false);
    } catch (actionError) {
      setError(toErrorMessage(actionError, "Action failed"));
    } finally {
      setBusy(false);
    }
  };

  const handleUploadDocument = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setUploading(true);
    setError(null);
    try {
      const uploaded = await uploadFile(file, "coworking-contracts");
      const updated = await addContractDocument(contract._id, {
        name: uploaded.fileName || file.name,
        fileUrl: uploaded.url,
        fileType: uploaded.mimeType || file.type,
        category: docCategory,
      });
      onChanged(updated);
    } catch (uploadError) {
      setError(toErrorMessage(uploadError, "Failed to upload document"));
    } finally {
      setUploading(false);
    }
  };

  return (
    <DetailDrawer
      open={Boolean(contract)}
      onClose={onClose}
      title={contract.contractCode}
      description={`${contract.clientId?.companyName || ""} · ${contract.contractType} contract`}
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={contract.status} />
          <Badge variant="slate">{contract.cabinId?.cabinCode}</Badge>
          {contract.seatCode ? <Badge variant="blue">{contract.seatCode}</Badge> : null}
          {contract.renewalOf ? <Badge variant="violet">Renewal</Badge> : null}
          {contract.supersededBy ? <Badge variant="amber">Renewed</Badge> : null}
        </div>

        {error ? (
          <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200">
            {error}
          </p>
        ) : null}

        <div className="space-y-2 text-sm">
          <p><span className="font-semibold text-slate-500">Dates:</span> {formatDate(contract.startDate)} → {formatDate(contract.endDate)}</p>
          <p><span className="font-semibold text-slate-500">Rent:</span> {formatCurrency(contract.rent)}/mo</p>
          <p><span className="font-semibold text-slate-500">Deposit:</span> {formatCurrency(contract.deposit)}</p>
          <p><span className="font-semibold text-slate-500">Lock-in:</span> {contract.lockInPeriodMonths} month(s)</p>
          <p><span className="font-semibold text-slate-500">Notice period:</span> {contract.noticePeriodDays} day(s)</p>
          {contract.terminationReason ? (
            <p className="text-rose-600 dark:text-rose-300">Terminated: {contract.terminationReason}</p>
          ) : null}
          {contract.notes ? <p className="text-slate-500">{contract.notes}</p> : null}
        </div>

        {canUpdate || canRenew ? (
          <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
            {contract.status === "DRAFT" && canUpdate ? (
              <Button size="sm" leftIcon={PlayCircle} disabled={busy} onClick={() => run(() => activateContract(contract._id))}>
                Activate
              </Button>
            ) : null}
            {["ACTIVE", "EXPIRING"].includes(contract.status) && canRenew && !contract.supersededBy ? (
              <Button size="sm" variant="secondary" leftIcon={RefreshCw} disabled={busy} onClick={() => setShowRenew((v) => !v)}>
                Renew
              </Button>
            ) : null}
            {["ACTIVE", "EXPIRING"].includes(contract.status) && canUpdate ? (
              <Button
                size="sm"
                variant="danger"
                leftIcon={Ban}
                disabled={busy}
                onClick={() => run(() => terminateContract(contract._id, "Terminated from contract detail"))}
              >
                Terminate
              </Button>
            ) : null}
          </div>
        ) : null}

        {showRenew ? (
          <div className="grid grid-cols-2 gap-2 rounded-xl border border-dashed border-slate-300 p-3 dark:border-slate-700">
            <Input type="date" placeholder="New end date" value={renewEndDate} onChange={(e) => setRenewEndDate(e.target.value)} />
            <Input type="number" placeholder="New rent (optional)" value={renewRent} onChange={(e) => setRenewRent(e.target.value)} />
            <Button
              size="sm"
              className="col-span-2"
              disabled={busy || !renewEndDate}
              onClick={() => run(() => renewContract(contract._id, renewEndDate, renewRent || undefined))}
            >
              Confirm Renewal
            </Button>
          </div>
        ) : null}

        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-[0.1em] text-slate-400">Documents</p>
          <div className="space-y-2">
            {contract.documents?.length ? (
              contract.documents.map((doc) => (
                <div key={doc._id} className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 px-3 py-2 dark:border-slate-800">
                  <a href={doc.fileUrl} target="_blank" rel="noreferrer" className="flex min-w-0 items-center gap-2 text-sm text-blue-700 hover:underline dark:text-blue-300">
                    <FileText aria-hidden="true" size={14} className="shrink-0" />
                    <span className="truncate">{doc.name}</span>
                    <Badge variant="slate">{doc.category}</Badge>
                  </a>
                  {canUpdate ? (
                    <IconButton
                      icon={Trash2}
                      label="Remove document"
                      size="sm"
                      onClick={() => run(() => removeContractDocument(contract._id, doc._id))}
                    />
                  ) : null}
                </div>
              ))
            ) : (
              <p className="text-xs text-slate-400">No documents uploaded</p>
            )}

            {canUpdate ? (
              <div className="flex items-center gap-2 rounded-xl border border-dashed border-slate-300 p-3 dark:border-slate-700">
                <Select value={docCategory} onChange={(e) => setDocCategory(e.target.value)} className="w-40">
                  {CONTRACT_DOCUMENT_CATEGORIES.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </Select>
                <input
                  type="file"
                  disabled={uploading}
                  onChange={handleUploadDocument}
                  className="flex-1 text-xs text-slate-500 file:mr-2 file:rounded-lg file:border-0 file:bg-blue-50 file:px-3 file:py-1.5 file:text-xs file:font-bold file:text-blue-700 dark:text-slate-400 dark:file:bg-blue-500/10 dark:file:text-blue-200"
                />
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </DetailDrawer>
  );
};

export default ContractDetailDrawer;
