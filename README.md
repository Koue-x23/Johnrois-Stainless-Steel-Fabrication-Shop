# Johnrois Stainless Steel Fabrication Shop — Business Management System

Complete internal business management application for **Johnrois Stainless Steel Fabrication Shop** (`https://www.facebook.com/johnroiscanon`).

## Core Capabilities

- **Dashboard**: Real-time counts and receivables metrics computed strictly from saved records (Quotations, Invoices, Billing Statements, Service Reports, Recent Transactions, and Recent Customer Activity).
- **Quotation Module**: Automatic sequential numbering (`QTN-YYYY-XXXX`), saved customer auto-fill, catalog item insertion, multi-item calculations, fixed/percentage discounts, optional tax, status workflow (`Draft`, `Sent`, `Approved`, `Rejected`, `Expired`), A4 Print & vector PDF download, and one-click **Approved Quotation → Invoice** conversion.
- **Invoice Module**: Automatic sequential numbering (`INV-YYYY-XXXX`), quotation reference linking, itemized charges, partial & full payment recording (`Unpaid`, `Partially Paid`, `Paid`, `Overdue`) without duplicating invoices, full payment history ledger, A4 Print & PDF download.
- **Service Report Module**: Supports Fabrication, Installation, Repair, Maintenance, and Inspection jobs (`SR-YYYY-XXXX`), equipment serviced, findings, work performed, materials & parts cost table, optional Before & After photo documentation, interactive touch/mouse signature pads for Technician and Customer acknowledgment, A4 Print & PDF download.
- **Billing Statement Module**: Summarizes any customer's saved invoices and payments over a selected date range (`SOA-YYYY-XXXX`), computing Previous Balance, chronological debits/credits, Running Balance, Total Charges, Total Payments, and Outstanding Balance with zero duplicate entries, plus A4 Print & PDF download.
- **Customer Management, Products & Services Catalog, Payments Ledger, Financial Reports (with CSV Exports), and Business Settings (with Direct Workspace Access & Full JSON Database Backup/Restore)**.

## Direct Workspace & Database Architecture

- Opens directly to the main **Dashboard** without requiring a login screen, email, username, or password.
- All records persist in the server-side SQLite database (`data/johnrois.sqlite`, WAL mode) accessed strictly through Express `/api/*` endpoints; zero database credentials or secret API keys are exposed in frontend code.

## Running Locally

```bash
npm install
npm run build
npm start
```

The unified Express + SQLite (`data/johnrois.sqlite`, WAL mode) server binds to `0.0.0.0:3000`.
