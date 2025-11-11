import { Router } from "express";
import {
  createPatient,
  getPatientById,
  updatePatient,
  updatePatientState,
  listPatients,
  createDiagnostic,
  getPatientDiagnostics,
  advancedSearch,
  bulkCreatePatient,
} from "../controllers/PatientController.js";
import { verifyToken } from "../middlewares/verifyToken.js";
import upload from "../middlewares/upload.js"; // para archivos

const router = Router();

router.post("/", createPatient);
router.get("/:id", verifyToken, getPatientById);
router.put("/:id", verifyToken, updatePatient);
router.patch("/:id/state", verifyToken, updatePatientState);
router.get("/", verifyToken, listPatients);
router.post("/bulk", bulkCreatePatient);

// Diagnósticos
router.post("/:patientId/diagnostics", verifyToken, upload.array("files", 10), createDiagnostic);
router.get("/:patientId/diagnostics", verifyToken, getPatientDiagnostics);

// Búsqueda avanzada
router.get("/search/advanced", verifyToken, advancedSearch);

export default router;