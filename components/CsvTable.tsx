
import React from 'react';

interface CsvTableProps {
  csvData: string;
}

export const CsvTable: React.FC<CsvTableProps> = ({ csvData }) => {
  // Simple CSV parser that handles basic quotes and commas
  const parseCsv = (text: string) => {
    // Remove code block markers if present
    const cleanText = text.replace(/```csv\n?|```/g, '').trim();
    const rows: string[][] = [];
    const lines = cleanText.split('\n');

    for (const line of lines) {
      if (!line.trim()) continue;
      const row: string[] = [];
      let currentField = '';
      let inQuotes = false;

      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
          row.push(currentField.trim().replace(/^"|"$/g, ''));
          currentField = '';
        } else {
          currentField += char;
        }
      }
      row.push(currentField.trim().replace(/^"|"$/g, ''));
      rows.push(row);
    }
    return rows;
  };

  const data = parseCsv(csvData);
  if (data.length === 0) return null;

  const [headers, ...rows] = data;

  // Define column width classes based on index (assuming standard 4-column structure)
  const getColWidthClass = (idx: number) => {
    switch (idx) {
      case 0: return 'w-40 min-w-[120px]'; // Module
      case 1: return 'w-64 min-w-[200px]'; // Function & Goal
      case 2: return 'w-72 min-w-[240px]'; // Standardized Technique
      case 3: return 'flex-1 min-w-[300px]'; // Key Elements
      default: return 'min-w-[150px]';
    }
  };

  return (
    <div className="overflow-x-auto border border-slate-200 rounded-xl shadow-inner">
      <table className="min-w-full divide-y divide-slate-200 bg-white table-fixed">
        <thead className="bg-slate-50">
          <tr>
            {headers.map((header, idx) => (
              <th
                key={idx}
                scope="col"
                className={`px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap ${getColWidthClass(idx)}`}
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((row, rowIdx) => (
            <tr key={rowIdx} className="hover:bg-blue-50/30 transition-colors">
              {row.map((cell, cellIdx) => (
                <td
                  key={cellIdx}
                  className={`px-4 py-4 text-sm text-slate-600 leading-relaxed break-words whitespace-normal align-top ${getColWidthClass(cellIdx)}`}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
