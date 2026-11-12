import React, { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Mail, Phone } from "lucide-react";
import { getContactLinks } from "../../services/databaseService";
import { toErrorMessage } from "../../utils/errorMessage";
import { MUT } from "../inventory/components/contactGlassTokens";
import { Avatar } from "../inventory/components/contactGlassUi";
import { ErrorLine, Tag } from "./dbUi";

import ContactLinksSection from "./ContactLinksSection";
import { contactHref, roleLabel } from "./dbHelpers";

/* Profile of a Database contact (guard, PA, accountant, manager...). */
const DbContactPage = () => {
  const { contactId } = useParams();
  const navigate = useNavigate();
  const [contact, setContact] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    getContactLinks(contactId).then((d) => {
      // Owners and brokers keep their own profile pages.
      if (d.contact.kind !== "CONTACT") navigate(contactHref(d.contact), { replace: true });
      else setContact(d.contact);
    }).catch((e) => setError(toErrorMessage(e, "Contact not found")));
  }, [contactId, navigate]);
  return (
    <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-4 p-3 sm:p-5" style={{ color: "var(--g-ink)" }}>
      <Link to="/database" className="inline-flex items-center gap-1.5 text-[13px]" style={MUT}><ArrowLeft size={15} /> Database</Link>
      <ErrorLine message={error} />
      {contact ? (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <Avatar name={contact.name} id={contact._id} size={52} />
            <div className="min-w-0 flex-1">
              <h1 className="text-[21px] font-semibold">{contact.name}</h1>
              <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[12.5px]" style={MUT}>
                <span>{contact.contactCode}</span>
                {(contact.roles || []).map((r) => <Tag key={r} tone="a">{roleLabel(r)}</Tag>)}
                {contact.isContactPoint ? <Tag tone="info">Contact point</Tag> : null}
                {contact.company ? <span>· {contact.company}</span> : null}
                {contact.designation ? <span>· {contact.designation}</span> : null}
              </div>
              {contact.sourceNote ? <div className="mt-1 text-[12.5px]" style={MUT}>Came from: {contact.sourceNote}</div> : null}
            </div>
            {contact.phone ? <a href={`tel:${contact.phone}`} className="inline-flex h-9 items-center gap-1.5 rounded-xl px-3 text-[13px] font-semibold" style={{ background: "var(--g-bs)", color: "var(--g-b)" }}><Phone size={14} /> {contact.phone}</a> : <Tag tone="warn">No phone on file</Tag>}
            {contact.email ? <a href={`mailto:${contact.email}`} className="inline-flex h-9 items-center gap-1.5 rounded-xl px-3 text-[13px]" style={{ background: "var(--g-track)" }}><Mail size={14} /> Email</a> : null}
          </div>
          <ContactLinksSection contactId={contact._id} />
        </>
      ) : null}
    </div>
  );
};

export default DbContactPage;
