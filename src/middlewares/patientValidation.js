const regex = {
  fullname: /^[A-Za-zÁÉÍÓÚáéíóúÑñ\s]{2,100}$/,
  identification: /^[0-9]{5,15}$/,
  phone: /^[0-9+\-()\s]{6,20}$/,
  email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  specialization: /^[A-Za-zÁÉÍÓÚáéíóúÑñ\s]{0,100}$/,
  department: /^[A-Za-zÁÉÍÓÚáéíóúÑñ\s]{0,100}$/,
  license_number: /^[A-Za-z0-9\-]{0,50}$/
};

// --- Sanitiza texto contra XSS ---
const sanitizeString = (str) => {
  return str ? String(str).replace(/[<>]/g, "").trim() : "";
};

// --- Validación para creación de paciente ---
export const validatePatientCreation = (req, res, next) => {
  const patient = req.body;
  const errors = [];

  // Sanitizar campos básicos
  for (const key in patient) patient[key] = sanitizeString(patient[key]);

  // Validación de campos obligatorios
  if (!patient.fullname) errors.push("El nombre completo es obligatorio");
  if (!patient.identification) errors.push("La identificación es obligatoria");
  if (!patient.phone) errors.push("El teléfono es obligatorio");
  if (!patient.date_of_birth) errors.push("La fecha de nacimiento es obligatoria");

  // Formatos usando regex
  if (patient.fullname && !regex.fullname.test(patient.fullname)) errors.push("Nombre inválido");
  if (patient.identification && !regex.identification.test(patient.identification)) errors.push("Identificación inválida");
  if (patient.phone && !regex.phone.test(patient.phone)) errors.push("Teléfono inválido");
  if (patient.email && patient.email.length && !regex.email.test(patient.email)) errors.push("Correo electrónico inválido");

  // Edad
  if (patient.date_of_birth) {
    const birthDate = new Date(patient.date_of_birth);
    const age = Math.floor((Date.now() - birthDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
    if (isNaN(age) || age < 0 || age > 120) errors.push("Edad fuera del rango permitido (0-120 años)");
  }

  if (errors.length > 0) return res.status(400).json({ message: "Errores de validación", errors });
  next();
};

// --- Validación para actualización de paciente ---
export const validatePatientUpdate = (req, res, next) => {
  const patient = req.body;
  const errors = [];

  // Sanitizar campos
  for (const key in patient) patient[key] = sanitizeString(patient[key]);

  // Validaciones solo si vienen presentes
  if (patient.fullname && !regex.fullname.test(patient.fullname)) errors.push("Nombre inválido");
  if (patient.identification && !regex.identification.test(patient.identification)) errors.push("Identificación inválida");
  if (patient.phone && !regex.phone.test(patient.phone)) errors.push("Teléfono inválido");
  if (patient.email && !regex.email.test(patient.email)) errors.push("Correo electrónico inválido");

  if (patient.date_of_birth) {
    const birthDate = new Date(patient.date_of_birth);
    const age = Math.floor((Date.now() - birthDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
    if (isNaN(age) || age < 0 || age > 120) errors.push("Edad fuera del rango permitido (0-120 años)");
  }

  if (errors.length > 0) return res.status(400).json({ message: "Errores de validación", errors });
  next();
};
