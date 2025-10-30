import express from 'express';
import PatientController, {
  createPatient,
  getPatientById,
  updatePatient,
  updatePatientState,
  listPatients,
  getPatientDiagnostics,
  advancedSearch
} from '../controllers/PatientController.js';
import {
  validatePatientCreation,
  validatePatientUpdate
} from '../middlewares/patientValidation.js';
import { attachUserFromToken } from '../middlewares/attachUserFromToken.js';
import { uploadDiagnosticMultiple } from '../config/multer.js';
const router = express.Router();

router.get('/:patientId/diagnostics', attachUserFromToken, PatientController.getPatientDiagnostics);
// Rutas de pacientes
router.post('/', validatePatientCreation, createPatient); // Crear paciente
router.get('/:id', getPatientById); // Obtener paciente por ID
router.put('/:id', validatePatientUpdate, updatePatient); // Actualizar paciente
router.patch('/state/:id', updatePatientState); // Cambiar estado (activo/inactivo)
router.get('/', listPatients); // Listar pacientes (paginado)

// Crear diagnóstico
// No poner verifyToken: el gateway ya lo hace y pasa el usuario en req.user
router.post(
  '/:patientId/diagnostics',
  attachUserFromToken,        // <-- Este middleware agrega req.user
  uploadDiagnosticMultiple,
  PatientController.createDiagnostic
);

// Búsqueda avanzada con múltiples filtros
router.get('/search/advanced', PatientController.advancedSearch);

export default router;
