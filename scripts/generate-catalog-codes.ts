import { exportCatalogCodes, exportCatalogCodeSchemas } from "@/seeds/catalog-codes.export.js";

if (process.argv[2] === "--schema-output") {
    if (!process.argv[3]) throw new Error("--schema-output requires a directory");
    exportCatalogCodeSchemas(process.argv[3]);
} else {
    exportCatalogCodes(process.argv[2] ?? "../ERPG");
}
