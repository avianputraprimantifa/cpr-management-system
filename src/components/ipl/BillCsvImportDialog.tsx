import { useState } from "react";
import Papa from "papaparse";
import { toast } from "sonner";
import { FileSpreadsheet, FileText, Loader2 } from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { FileUploadButton } from "@/components/ui/file-upload-button";
import { supabase } from "@/integrations/supabase/client";
import { billNameFromPeriod, periodFromDueDate } from "@/lib/date";
import { edgeFunctionErrorMessage } from "@/lib/edge-function-error";
import { M } from "@/lib/i18n/messages";

interface Row {
  email: string;
  amount: string;
  due_date: string;
  name?: string;
}

type RawImportRow = Record<string, string | number | null | undefined>;
export type BillImportFormat = "csv" | "excel";
type CreateIplBillsResponse = {
  created?: number;
  skipped?: number;
  failed?: number;
  errors?: string[];
  error?: string;
};

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onImported: () => void;
  format: BillImportFormat;
}

function normalizeHeader(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function cellText(value: string | number | null | undefined) {
  return value == null ? "" : String(value).trim();
}

function readField(row: RawImportRow, aliases: string[]) {
  const aliasSet = new Set(aliases);
  const entry = Object.entries(row).find(([key]) => aliasSet.has(normalizeHeader(key)));
  return cellText(entry?.[1]);
}

function excelSerialDate(value: string) {
  if (!/^\d+(\.\d+)?$/.test(value)) return value;
  const serial = Number(value);
  if (!Number.isFinite(serial) || serial < 20000 || serial > 80000) return value;
  const date = new Date(Date.UTC(1899, 11, 30) + serial * 86400000);
  return date.toISOString().slice(0, 10);
}

function normalizeRows(rows: RawImportRow[]): Row[] {
  return rows.map((row) => {
    const dueDate = readField(row, ["duedate", "jatuhtempo", "tanggalkadaluarsa"]);
    return {
      email: readField(row, ["email", "mail", "surel"]),
      amount: readField(row, ["amount", "jumlah", "jumlahrp", "nominal"]),
      due_date: excelSerialDate(dueDate),
      name: readField(row, ["name", "namatagihan", "tagihan"]) || undefined,
    };
  });
}

function tableToRows(matrix: string[][]) {
  const [headers, ...body] = matrix;
  if (!headers?.length) return [];
  return body
    .filter((cells) => cells.some((cell) => cell.trim()))
    .map((cells) => headers.reduce<RawImportRow>((row, header, index) => {
      row[header] = cells[index] ?? "";
      return row;
    }, {}));
}

function parseCsvFile(file: File) {
  return new Promise<Row[]>((resolve, reject) => {
    Papa.parse<RawImportRow>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (res) => resolve(normalizeRows(res.data)),
      error: (err) => reject(new Error(err.message)),
    });
  });
}

function parseHtmlTable(text: string) {
  const doc = new DOMParser().parseFromString(text, "text/html");
  const table = doc.querySelector("table");
  if (!table) return null;
  const matrix = Array.from(table.querySelectorAll("tr")).map((row) =>
    Array.from(row.querySelectorAll("th,td")).map((cell) => cell.textContent?.trim() ?? ""),
  );
  return normalizeRows(tableToRows(matrix));
}

function readUint16(bytes: Uint8Array, offset: number) {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function readUint32(bytes: Uint8Array, offset: number) {
  return (
    bytes[offset] |
    (bytes[offset + 1] << 8) |
    (bytes[offset + 2] << 16) |
    (bytes[offset + 3] << 24)
  ) >>> 0;
}

async function inflateZipEntry(data: Uint8Array) {
  if (!globalThis.DecompressionStream) {
    throw new Error("Browser belum mendukung pembacaan file XLSX. Simpan file sebagai CSV lalu coba lagi.");
  }
  const chunk = new Uint8Array(data.byteLength);
  chunk.set(data);
  const stream = new Blob([chunk.buffer]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function unzipXmlEntries(file: File) {
  const decoder = new TextDecoder();
  const bytes = new Uint8Array(await file.arrayBuffer());
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (readUint32(bytes, i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd === -1) throw new Error("File XLSX tidak valid.");

  const entries = new Map<string, string>();
  const entryCount = readUint16(bytes, eocd + 10);
  let cursor = readUint32(bytes, eocd + 16);

  for (let i = 0; i < entryCount; i++) {
    if (readUint32(bytes, cursor) !== 0x02014b50) break;
    const method = readUint16(bytes, cursor + 10);
    const compressedSize = readUint32(bytes, cursor + 20);
    const nameLength = readUint16(bytes, cursor + 28);
    const extraLength = readUint16(bytes, cursor + 30);
    const commentLength = readUint16(bytes, cursor + 32);
    const localOffset = readUint32(bytes, cursor + 42);
    const name = decoder.decode(bytes.slice(cursor + 46, cursor + 46 + nameLength));
    const shouldRead = /^xl\/(sharedStrings\.xml|workbook\.xml|_rels\/workbook\.xml\.rels|worksheets\/.+\.xml)$/.test(name);

    if (shouldRead) {
      const localNameLength = readUint16(bytes, localOffset + 26);
      const localExtraLength = readUint16(bytes, localOffset + 28);
      const dataStart = localOffset + 30 + localNameLength + localExtraLength;
      const compressed = bytes.slice(dataStart, dataStart + compressedSize);
      const payload = method === 0 ? compressed : method === 8 ? await inflateZipEntry(compressed) : null;
      if (!payload) throw new Error(`File XLSX memakai kompresi yang belum didukung: ${name}`);
      entries.set(name, decoder.decode(payload));
    }

    cursor += 46 + nameLength + extraLength + commentLength;
  }

  return entries;
}

function parseXml(text: string) {
  const doc = new DOMParser().parseFromString(text, "application/xml");
  if (doc.getElementsByTagName("parsererror").length > 0) throw new Error("Struktur XML XLSX tidak valid.");
  return doc;
}

function firstSheetPath(entries: Map<string, string>) {
  const workbook = entries.get("xl/workbook.xml");
  const rels = entries.get("xl/_rels/workbook.xml.rels");
  if (workbook && rels) {
    const sheet = parseXml(workbook).getElementsByTagName("sheet")[0];
    const relId = sheet?.getAttribute("r:id");
    if (relId) {
      const relationship = Array.from(parseXml(rels).getElementsByTagName("Relationship"))
        .find((rel) => rel.getAttribute("Id") === relId);
      const target = relationship?.getAttribute("Target");
      if (target) return target.startsWith("/") ? target.slice(1) : `xl/${target}`;
    }
  }
  return Array.from(entries.keys()).find((key) => /^xl\/worksheets\/sheet\d+\.xml$/.test(key));
}

function columnIndex(ref: string) {
  const letters = ref.match(/[A-Z]+/)?.[0] ?? "";
  return letters.split("").reduce((value, letter) => value * 26 + letter.charCodeAt(0) - 64, 0) - 1;
}

function parseSharedStrings(xml?: string) {
  if (!xml) return [];
  return Array.from(parseXml(xml).getElementsByTagName("si")).map((node) => {
    const textNodes = Array.from(node.getElementsByTagName("t"));
    return textNodes.length > 0
      ? textNodes.map((text) => text.textContent ?? "").join("")
      : node.textContent ?? "";
  });
}

function cellValue(cell: Element, sharedStrings: string[]) {
  const type = cell.getAttribute("t");
  if (type === "inlineStr") {
    return Array.from(cell.getElementsByTagName("t")).map((node) => node.textContent ?? "").join("");
  }
  const raw = cell.getElementsByTagName("v")[0]?.textContent ?? "";
  if (type === "s") return sharedStrings[Number(raw)] ?? "";
  if (type === "b") return raw === "1" ? "TRUE" : "FALSE";
  return raw;
}

async function parseXlsxFile(file: File) {
  const entries = await unzipXmlEntries(file);
  const sheetPath = firstSheetPath(entries);
  const sheetXml = sheetPath ? entries.get(sheetPath) : undefined;
  if (!sheetXml) throw new Error("Sheet pertama tidak ditemukan di file XLSX.");

  const sharedStrings = parseSharedStrings(entries.get("xl/sharedStrings.xml"));
  const rows = Array.from(parseXml(sheetXml).getElementsByTagName("row")).map((row) => {
    const cells: string[] = [];
    Array.from(row.getElementsByTagName("c")).forEach((cell) => {
      const ref = cell.getAttribute("r") ?? "";
      const index = columnIndex(ref);
      cells[index >= 0 ? index : cells.length] = cellValue(cell, sharedStrings);
    });
    return cells;
  });

  return normalizeRows(tableToRows(rows));
}

async function parseImportFile(file: File, format: BillImportFormat) {
  if (format === "csv") return parseCsvFile(file);
  if (file.name.toLowerCase().endsWith(".xlsx")) return parseXlsxFile(file);
  const htmlRows = parseHtmlTable(await file.text());
  if (!htmlRows) {
    throw new Error("File Excel harus berupa .xlsx atau .xls/HTML table. Untuk format lain, simpan sebagai CSV.");
  }
  return htmlRows;
}

export function BillCsvImportDialog({ open, onOpenChange, onImported, format }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [log, setLog]   = useState<string[]>([]);
  const isCsv = format === "csv";

  function pick(f: File | null) {
    setLog([]);
    setFile(f);
  }

  async function run() {
    if (!file) return;
    setBusy(true);
    setLog([]);
    try {
      const rows = await parseImportFile(file, format);
      let ok = 0, fail = 0;
      const lines: string[] = [];

      const emails = Array.from(new Set(rows.map((r) => r.email?.trim()).filter(Boolean)));
      if (emails.length === 0) {
        setLog(["Tidak ada email yang terbaca dari file."]);
        toast.error("File belum berisi kolom email yang valid.");
        setBusy(false);
        return;
      }
      const { data: profiles, error: pErr } = await supabase
        .from("profiles").select("user_id, email").in("email", emails);
      if (pErr) {
        toast.error(`${M.generic}: ${pErr.message}`);
        setBusy(false); return;
      }
      const emailToId = new Map((profiles ?? []).map((p) => [p.email, p.user_id]));

      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        const lineNo = i + 2;
        const email = r.email?.trim();
        const amount = Number(r.amount);
        const dueDate = r.due_date?.trim();

        if (!email || !dueDate || Number.isNaN(amount)) {
          lines.push(`Baris ${lineNo}: data tidak lengkap.`); fail++; continue;
        }
        const uid = emailToId.get(email);
        if (!uid) { lines.push(`Baris ${lineNo}: email ${email} tidak ditemukan.`); fail++; continue; }
        if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) {
          lines.push(`Baris ${lineNo}: jatuh tempo harus format YYYY-MM-DD.`); fail++; continue;
        }
        const period = periodFromDueDate(dueDate);
        const name = r.name?.trim() || billNameFromPeriod(period);

        const { data, error } = await supabase.functions.invoke("create-ipl-bills", {
          body: {
            resident_user_id: uid,
            name,
            amount,
            due_date: dueDate,
            period,
            status: "belum_dibayar",
          },
        });
        const result = data as CreateIplBillsResponse | null;
        if (error || result?.error || (result?.failed ?? 0) > 0 || (result?.skipped ?? 0) > 0) {
          if ((result?.skipped ?? 0) > 0) {
            lines.push(`Baris ${lineNo}: ${email} sudah punya tagihan untuk ${period}.`);
          } else {
            const detail = result?.error
              ?? result?.errors?.[0]
              ?? edgeFunctionErrorMessage(error, "create-ipl-bills", M.saveFailed);
            lines.push(`Baris ${lineNo}: ${detail}`);
          }
          fail++; continue;
        }
        ok += result?.created ?? 1;
      }

      setBusy(false);
      setLog(lines);
      if (ok > 0) toast.success(`${ok} tagihan berhasil diimpor.`);
      if (fail > 0) toast.error(`${fail} baris gagal — lihat detail di bawah.`);
      if (ok > 0) onImported();
    } catch (err) {
      setBusy(false);
      toast.error(`Gagal membaca ${isCsv ? "CSV" : "Excel"}: ${(err as Error).message}`);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Impor Tagihan dari {isCsv ? "CSV" : "Excel"}</DialogTitle>
          <DialogDescription>
            Kolom wajib: <code>email, amount, due_date</code> (opsional: <code>name</code>). Periode otomatis dari <code>due_date</code>.
            {!isCsv && " File Excel dapat berupa .xlsx atau .xls table."}
          </DialogDescription>
        </DialogHeader>

        <FileUploadButton
          id={`ipl-import-${format}`}
          label={isCsv ? "File CSV" : "File Excel"}
          accept={isCsv
            ? ".csv,text/csv"
            : ".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/html"}
          file={file}
          onChange={pick}
          buttonLabel={isCsv ? "Pilih CSV" : "Pilih Excel"}
          buttonLabelChange={isCsv ? "Ganti CSV" : "Ganti Excel"}
          hint={isCsv
            ? "Gunakan CSV dengan header email, amount, due_date, dan opsional name."
            : "Gunakan XLSX atau XLS table dengan header email, amount, due_date, dan opsional name."}
        />

        {log.length > 0 && (
          <div className="max-h-48 overflow-auto rounded-md bg-muted p-3 text-xs space-y-1">
            {log.map((l, i) => <div key={i}>{l}</div>)}
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Tutup</Button>
          <Button onClick={run} disabled={!file || busy}>
            {busy ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : isCsv ? (
              <FileText className="mr-2 h-4 w-4" />
            ) : (
              <FileSpreadsheet className="mr-2 h-4 w-4" />
            )}
            Impor
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
