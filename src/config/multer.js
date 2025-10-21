import multer from "multer";
import fs from "fs";
import path from "path";

/* -------------------------------------------
   Crear directorio si no existe
--------------------------------------------*/
const ensureDirectoryExists = (directory) => {
  if (!fs.existsSync(directory)) {
    fs.mkdirSync(directory, { recursive: true });
  }
};

/* -------------------------------------------
   Configuración: Subida de diagnósticos
--------------------------------------------*/
const diagnosticStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = path.join("uploads", "patients", "diagnostics");
    ensureDirectoryExists(uploadPath);
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const patientId = req.params.patientId || "unknown";
    const timestamp = Date.now();
    const randomString = Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, `diagnostic-${patientId}-${timestamp}_${randomString}${ext}`);
  },
});

/* -------------------------------------------
   Tipos de archivo permitidos
--------------------------------------------*/
const diagnosticFileFilter = (req, file, cb) => {
  const allowedMimeTypes = [
    "application/pdf",
    "image/jpeg",
    "image/jpg",
    "image/png",
  ];

  const allowedExtensions = /\.(pdf|jpeg|jpg|png)$/i;

  const extname = allowedExtensions.test(path.extname(file.originalname).toLowerCase());
  const mimetype = allowedMimeTypes.includes(file.mimetype);

  if (mimetype && extname) return cb(null, true);

  cb(new Error(`Tipo no permitido: ${file.mimetype}. Solo PDF, JPEG, JPG, PNG`));
};

/* -------------------------------------------
   Configuración principal para diagnósticos
--------------------------------------------*/
const uploadDiagnostic = multer({
  storage: diagnosticStorage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: diagnosticFileFilter,
});

export const uploadDiagnosticSingle = uploadDiagnostic.single("document");
export const uploadDiagnosticMultiple = uploadDiagnostic.array("documents", 5);
