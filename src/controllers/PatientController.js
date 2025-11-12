import { getPrismaClient } from "../config/database.js";
import crypto from "crypto";
import fs from "fs";
import axios from "axios";
import { sendError } from "../utils/errorHandler.js";

const prisma = getPrismaClient();

const DIAGNOSTIC_SERVICE_URL = process.env.DIAGNOSTIC_SERVICE_URL || "http://med-core-diagnostic-service:3000";
const USER_SERVICE_URL = process.env.USER_SERVICE_URL || "http://med-core-user-service:3000";

// === CALCULAR EDAD ===
const calculateAge = (dateOfBirth) => {
  const diff = Date.now() - dateOfBirth.getTime();
  const ageDate = new Date(diff);
  return Math.abs(ageDate.getUTCFullYear() - 1970);
};

// === CREAR PACIENTE ===
export const createPatient = async (req, res) => {
  try {
    const { email, fullname, date_of_birth, phone } = req.body;

    if (!email || !fullname || !date_of_birth) {
      return res.status(400).json({ message: "Faltan campos obligatorios" });
    }

    // Verificar duplicado por email
    const existing = await prisma.users.findUnique({ where: { email } });
    if (existing) {
      return res.status(400).json({ message: "El correo ya está registrado" });
    }

    const birthDate = new Date(date_of_birth);
    const age = calculateAge(birthDate);
    if (age < 0 || age > 100) {
      return res.status(400).json({ message: "La edad debe estar entre 0 y 100 años" });
    }

    const verificationCode = crypto.randomBytes(3).toString("hex").toUpperCase();
    const verificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const newPatient = await prisma.users.create({
      data: {
        email,
        fullname,
        date_of_birth: birthDate,
        phone,
        role: "PACIENTE",
        verificationCode,
        verificationExpires,
        status: "PENDING",
        current_password: "TEMPORARY",
      },
    });

    console.log(`Paciente creado: ${newPatient.id} - ${email}`);
    res.status(201).json({ message: "Paciente creado exitosamente", patient: newPatient });

  } catch (error) {
    console.error("Error en createPatient:", error.message);
    sendError(error, res);
  }
};

// === OBTENER POR ID ===
export const getPatientById = async (req, res) => {
  try {
    const { id } = req.params;
    const patient = await prisma.users.findUnique({
      where: { id },
      include: { patient: true },
    });

    if (!patient) {
      return res.status(404).json({ message: "Paciente no encontrado" });
    }

    res.json(patient);
  } catch (error) {
    sendError(error, res);
  }
};

// === ACTUALIZAR PACIENTE ===
export const updatePatient = async (req, res) => {
  try {
    const { id } = req.params;
    const { fullname, date_of_birth, phone } = req.body;

    const patient = await prisma.users.findUnique({ where: { id } });
    if (!patient) {
      return res.status(404).json({ message: "Paciente no encontrado" });
    }

    const updated = await prisma.users.update({
      where: { id },
      data: {
        fullname,
        date_of_birth: date_of_birth ? new Date(date_of_birth) : patient.date_of_birth,
        phone,
      },
    });

    res.json({ message: "Paciente actualizado", patient: updated });
  } catch (error) {
    sendError(error, res);
  }
};

// === CAMBIAR ESTADO ===
export const updatePatientState = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!["ACTIVE", "INACTIVE", "PENDING"].includes(status)) {
      return res.status(400).json({ message: "Estado inválido" });
    }

    const updated = await prisma.users.update({
      where: { id },
      data: { status },
    });

    res.json({ message: "Estado actualizado", patient: updated });
  } catch (error) {
    sendError(error, res);
  }
};

// === LISTAR PACIENTES ===
export const listPatients = async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const [patients, total] = await Promise.all([
      prisma.users.findMany({
        where: { role: "PACIENTE" },
        skip,
        take: Number(limit),
        orderBy: { createdAt: "desc" },
        include: { patient: true },
      }),
      prisma.users.count({ where: { role: "PACIENTE" } }),
    ]);

    res.json({
      total,
      page: Number(page),
      pages: Math.ceil(total / limit),
      patients,
    });
  } catch (error) {
    sendError(error, res);
  }
};

// === CREAR DIAGNÓSTICO (proxy) ===
export const createDiagnostic = async (req, res) => {
  const { patientId } = req.params;
  const doctorId = req.user?.id;
  const files = req.files || [];

  try {
    const FormData = (await import("form-data")).default;
    const formData = new FormData();

    Object.entries(req.body).forEach(([key, value]) => formData.append(key, value));
    formData.append("patientId", patientId);
    formData.append("doctorId", doctorId);

    for (const file of files) {
      formData.append("files", fs.createReadStream(file.path), file.originalname);
    }

    const response = await axios.post(
      `${DIAGNOSTIC_SERVICE_URL}/api/v1/patients/${patientId}/diagnostics`,
      formData,
      {
        headers: {
          ...formData.getHeaders(),
          Authorization: req.headers.authorization,
        },
      }
    );

    files.forEach(f => {
      try { fs.unlinkSync(f.path); } catch { }
    });

    res.status(201).json({ message: "Diagnóstico creado", data: response.data });
  } catch (error) {
    files.forEach(f => {
      try { fs.unlinkSync(f.path); } catch { }
    });
    console.error("Error creando diagnóstico:", error.message);
    sendError(error, res);
  }
};

// === OBTENER DIAGNÓSTICOS DEL PACIENTE ===
export const getPatientDiagnostics = async (req, res) => {
  const { patientId } = req.params;
  const user = req.user;

  try {
    if (user.role === "ENFERMERO") {
      return res.status(403).json({ message: "Los enfermeros no tienen acceso a diagnósticos." });
    }

    if (user.role === "PACIENTE") {
      const resp = await axios.get(`${USER_SERVICE_URL}/api/v1/users/${user.id}`);
      if (resp.data.id !== patientId) {
        return res.status(403).json({ message: "No puedes ver diagnósticos de otros pacientes." });
      }
    }

    const diagnosticsResp = await axios.get(
      `${DIAGNOSTIC_SERVICE_URL}/api/v1/patients/${patientId}/diagnostics`,
      { headers: { Authorization: req.headers.authorization } }
    );

    res.json(diagnosticsResp.data);
  } catch (error) {
    sendError(error, res);
  }
};

// === BÚSQUEDA AVANZADA ===
export const advancedSearch = async (req, res) => {
  try {
    const { diagnostic, dateFrom, dateTo } = req.query;
    console.log("Búsqueda avanzada:", { diagnostic, dateFrom, dateTo });

    let gte, lte;
    if (dateFrom) {
      const d = new Date(dateFrom + "T00:00:00Z");
      if (isNaN(d)) return res.status(400).json({ message: "dateFrom inválida" });
      gte = d;
    }
    if (dateTo) {
      const d = new Date(dateTo + "T23:59:59Z");
      if (isNaN(d)) return res.status(400).json({ message: "dateTo inválida" });
      lte = d;
    }

    const params = {};
    if (diagnostic) params.diagnostic = diagnostic;
    if (gte) params.dateFrom = gte.toISOString().slice(0, 10);
    if (lte) params.dateTo = lte.toISOString().slice(0, 10);

    const headers = req.headers.authorization ? { Authorization: req.headers.authorization } : {};

    const diagResp = await axios.get(`${DIAGNOSTIC_SERVICE_URL}/api/v1/diagnostics/search`, {
      params,
      headers,
    });

    const diagnostics = Array.isArray(diagResp.data?.data) ? diagResp.data.data : [];
    const patientIds = [...new Set(diagnostics.map(d => String(d.patientId)).filter(Boolean))];

    if (patientIds.length === 0) {
      return res.json({ message: "Búsqueda completada", data: [] });
    }

    let users = [];
    try {
      const userResp = await axios.post(
        `${USER_SERVICE_URL}/api/v1/users/bulk`,
        { userIds: patientIds },
        { headers }
      );
      users = Array.isArray(userResp.data?.data) ? userResp.data.data : [];
    } catch (err) {
      console.warn("Error obteniendo usuarios:", err.message);
    }

    const userById = Object.fromEntries(users.map(u => [u.id, u]));

    const enriched = patientIds.map(id => {
      const user = userById[id];
      if (!user) return null;
      return {
        patient: user,
        diagnostics: diagnostics.filter(d => String(d.patientId) === id),
      };
    }).filter(Boolean);

    enriched.sort((a, b) => (a.patient.fullname ?? "").localeCompare(b.patient.fullname ?? "", "es"));

    res.json({ message: "Búsqueda completada", data: enriched });
  } catch (error) {
    console.error("Error en advancedSearch:", error.message);
    sendError(error, res);
  }
};

// === BULK CREATE (para carga masiva) ===
export const bulkCreatePatient = async (req, res) => {
  try {
    const prisma = getPrismaClient();
    const {
      userId,
      documentNumber,
      birthDate,
      age,
      gender,
      phone,
      address,
    } = req.body;

    if (!userId) {
      return res.status(400).json({ message: "userId es obligatorio" });
    }

    // Validar que sea paciente
    const userRes = await axios.get(`${USER_SERVICE_URL}/api/v1/users/${userId}`);
    if (userRes.data.role !== "PACIENTE") {
      return res.status(400).json({ message: "El usuario no es PACIENTE" });
    }

    const existing = await prisma.patient.findUnique({ where: { userId } });
    if (existing) {
      return res.status(200).json({ message: "Paciente ya existe", id: existing.id });
    }

    const patient = await prisma.patient.create({
      data: {
        userId,
        documentNumber: documentNumber || `TEMP-${Date.now()}`,
        birthDate: birthDate ? new Date(birthDate) : null,
        age: age || calculateAge(new Date(birthDate || Date.now())),
        gender: gender || "OTRO",
        phone,
        address,
        state: "ACTIVE",
      },
    });

    console.log(`Paciente perfil creado: ${patient.id} - userId: ${userId}`);
    res.status(201).json(patient);

  } catch (error) {
    console.error("Error en bulkCreatePatient:", error.message);
    sendError(error, res);
  }
};
export const getPatientProfile = async (req, res) => {
  try {
    const id = req.user?.id; // ID del usuario autenticado (desde el token)

    if (!id) {
      return res.status(401).json({ message: "Usuario no autenticado." });
    }

    // 1 Buscar el registro del paciente por su userId
    const patient = await prisma.patient.findUnique({
      where: { userId: id },
      select: {
        birthDate: true,
        age: true,
        gender: true,
        phone: true,
        address: true,
        state: true,
      },
    });

    if (!patient) {
      return res.status(404).json({ message: "Paciente no encontrado." });
    }
    // 2 Obtener los datos del usuario desde el User Service
    const userResponse = await axios.get(
      `${USER_SERVICE_URL}/api/v1/users/${id}`
    );

    const userData = userResponse.data;

    // 3 Combinar ambos resultados
    const profile = {
      fullname: userData.fullname,
      email: userData.email,
      role: userData.role,
      ...patient,
    };

    return res.status(200).json(profile);
  } catch (error) {
    console.error("Error al obtener perfil del paciente:", error.message);
    return res.status(500).json({ message: "Error interno del servidor." });
  }
};