import React, { useState } from 'react';
import { Search, Filter, MoreVertical, Phone, MapPin, Calendar, Clock, ChevronRight } from 'lucide-react';
import { motion as Motion } from 'framer-motion';

// Mock Data
const initialLeads = [
    { id: 1, name: "Rahul Verma", phone: "+91 98765 43210", project: "Skyline Towers", status: "New", source: "Meta Ads", time: "2m ago", budget: "2 Cr" },
    { id: 2, name: "Priya Sharma", phone: "+91 99887 76655", project: "Grand Villa", status: "New", source: "Website", time: "15m ago", budget: "4.5 Cr" },
    { id: 3, name: "Amit Patel", phone: "+91 88776 65544", project: "Skyline Towers", status: "Assigned", source: "Referral", time: "1h ago", budget: "1.2 Cr" },
    { id: 4, name: "Sneha Gupta", phone: "+91 77665 54433", project: "Commercial Hub", status: "Site Visit", source: "Meta Ads", time: "1d ago", budget: "8 Cr" },
];

const LeadCard = ({ lead, index }) => (
    <Motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: index * 0.1 }}
        whileHover={{ scale: 1.02, boxShadow: "0 20px 40px -10px rgba(0,0,0,0.1)" }}
        className="bg-white/80 backdrop-blur-xl p-5 rounded-2xl mb-4 border border-white shadow-sm cursor-pointer group relative overflow-hidden"
    >
        {/* Decorative Gradient Bar */}
        <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-gradient-to-b from-gold-400 to-gold-600" />

        <div className="flex justify-between items-start mb-3 pl-3">
            <div>
                <h4 className="font-bold text-primary text-lg leading-tight">{lead.name}</h4>
                <div className="flex items-center gap-2 mt-1">
                    <span className="text-[10px] font-black tracking-wider text-white bg-primary px-2 py-0.5 rounded-md uppercase">{lead.source}</span>
                    <span className="text-xs text-secondary font-medium">{lead.time}</span>
                </div>
            </div>
            <div className="text-right">
                <p className="text-sm font-bold text-gold-600">{lead.budget}</p>
                <p className="text-[10px] text-secondary font-medium uppercase tracking-wide">Budget</p>
            </div>
        </div>

        <div className="pl-3 space-y-2">
            <div className="flex items-center gap-2 text-secondary text-xs font-semibold bg-secondary/5 p-2 rounded-lg">
                <MapPin size={12} className="text-primary" /> {lead.project}
            </div>
            <div className="flex items-center gap-2 text-secondary text-xs font-semibold bg-secondary/5 p-2 rounded-lg">
                <Phone size={12} className="text-primary" /> {lead.phone}
            </div>
        </div>

        {/* Hover Action Button */}
        <Motion.div
            initial={{ x: 50 }}
            whileHover={{ x: 0 }}
            className="absolute right-0 bottom-0 bg-primary text-white p-3 rounded-tl-2xl opacity-0 group-hover:opacity-100 transition-all"
        >
            <ChevronRight size={20} />
        </Motion.div>
    </Motion.div>
);

const LeadPool = () => {
    const [leads] = useState(initialLeads);
    const columns = ["New", "Assigned", "Site Visit", "Closed"];

    return (
        <Motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="h-full flex flex-col"
        >
            {/* Filters Bar */}
            <div className="mb-4 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:items-center sm:justify-between">
                <div className="glass-technical flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-secondary shadow-sm sm:w-96 sm:px-4">
                    <Search size={20} className="text-primary" />
                    <input type="text" placeholder="Search by name, phone, or project..." className="bg-transparent outline-none text-sm w-full font-medium placeholder:text-secondary/50" />
                </div>

                <div className="grid grid-cols-[auto_1fr] gap-2 sm:flex sm:gap-3">
                    <button className="glass-technical inline-flex h-11 w-11 items-center justify-center rounded-xl text-primary transition-colors hover:bg-white sm:h-auto sm:w-auto sm:p-3">
                        <Filter size={20} />
                    </button>
                    <button className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-white shadow-lg shadow-primary/20 hover:bg-primary/90 sm:px-6">
                        <span>+ MANUAL ENTRY</span>
                    </button>
                </div>
            </div>

            {/* Kanban Board */}
            <div className="flex-1 pb-4 sm:overflow-x-auto">
                <div className="grid h-full grid-cols-1 gap-4 sm:flex sm:min-w-[1200px] sm:gap-6">
                    {columns.map((col) => (
                        <div key={col} className="flex h-full min-w-0 flex-1 flex-col sm:min-w-[300px]">
                            {/* Column Header */}
                            <div className="flex justify-between items-center mb-4 px-2">
                                <div className="flex items-center gap-2">
                                    <div className={`w-3 h-3 rounded-full ${col === 'New' ? 'bg-blue-500' : col === 'Closed' ? 'bg-success' : 'bg-gold-500'}`} />
                                    <h3 className="font-black text-secondary text-xs uppercase tracking-widest">{col}</h3>
                                </div>
                                <span className="bg-white text-primary text-xs font-bold px-2 py-1 rounded-lg shadow-sm border border-secondary/10">
                                    {leads.filter(l => l.status === col).length}
                                </span>
                            </div>

                            {/* Column Drop Zone */}
                            <div className="custom-scrollbar flex-1 rounded-2xl border border-secondary/5 bg-secondary/5 p-3 shadow-inner sm:rounded-[2rem] sm:p-4 sm:overflow-y-auto">
                                {leads.filter(l => l.status === col).map((lead, index) => (
                                    <LeadCard key={lead.id} lead={lead} index={index} />
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </Motion.div>
    );
};

export default LeadPool;
