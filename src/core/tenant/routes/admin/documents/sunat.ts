import { Hono } from "hono";
import { authMiddleware } from "../../../middleware/auth.middleware";
import { searchDocumentController } from "../../../controllers/admin/documents/sunat.controller";

const sunat = new Hono();

sunat.use('*', authMiddleware);
sunat.get("/search", searchDocumentController);

export default sunat;

