// pdf-parse's bundled pdf.js reads a plain Uint8Array; since Node 24 it fails on a Buffer ("bad XRef entry").
declare module 'pdf-parse/lib/pdf-parse.js' { import pdf from 'pdf-parse'; export default function parse(data: Uint8Array, options?: pdf.Options): Promise<pdf.Result>; }
