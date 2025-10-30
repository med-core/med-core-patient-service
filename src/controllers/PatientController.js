import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';
import fs from 'fs';
import diagnosticClient from '../utils/diagnosticClient.js';
import axios from 'axios';

const prisma = new PrismaClient();
const DIAGNOSTIC_SERVICE_URL = process.env.DIAGNOSTIC_SERVICE_URL || "http://med-core-diagnostic-service:3000";
const USER_SERVICE_URL = process.env.USER_SERVICE_URL || "http://med-core-user-service:3000";

// Calcular edad automáticamente
export const calculateAge = (dateOfBirth) => {
  const diff = Date.now() - dateOfBirth.getTime();
  const ageDate = new Date(diff);
  return Math.abs(ageDate.getUTCFullYear() - 1970);
};

// Crear paciente
export const createPatient = async (req, res) => {
  try {
    const { email, fullname, date_of_birth, phone } = req.body;

    // Verificar si el paciente ya existe por email
    const existing = await prisma.users.findUnique({ where: { email } });
    if (existing)
      return res.status(400).json({ message: 'El correo ya está registrado' });

    // Calcular edad
    const birthDate = new Date(date_of_birth);
    const age = calculateAge(birthDate);
    if (age < 0 || age > 100)
      return res.status(400).json({ message: 'La edad debe estar entre 0 y 100 años' });

    // Generar código de verificación
    const verificationCode = crypto.randomBytes(3).toString('hex').toUpperCase();
    const verificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h

    const newPatient = await prisma.users.create({
      data: {
        email,
        fullname,
        date_of_birth: birthDate,
        phone,
        role: 'PACIENTE',
        verificationCode,
        verificationExpires,
        status: 'PENDING',
        current_password: 'TEMPORARY', // o generar uno aleatorio
      },
    });

    res.status(201).json({ message: 'Paciente creado exitosamente', patient: newPatient });
  } catch (error) {
    console.error('Error al crear paciente:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
};

// Obtener paciente por ID
export const getPatientById = async (req, res) => {
  try {
    const { id } = req.params;
    const patient = await prisma.users.findUnique({ where: { id } });
    if (!patient) return res.status(404).json({ message: 'Paciente no encontrado' });
    res.json(patient);
  } catch (error) {
    console.error('Error al obtener paciente:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
};

// Actualizar paciente
export const updatePatient = async (req, res) => {
  try {
    const { id } = req.params;
    const { fullname, date_of_birth, phone } = req.body;

    const patient = await prisma.users.findUnique({ where: { id } });
    if (!patient) return res.status(404).json({ message: 'Paciente no encontrado' });

    const updated = await prisma.users.update({
      where: { id },
      data: {
        fullname,
        date_of_birth: date_of_birth ? new Date(date_of_birth) : patient.date_of_birth,
        phone,
      },
    });

    res.json({ message: 'Paciente actualizado correctamente', patient: updated });
  } catch (error) {
    console.error('Error al actualizar paciente:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
};

// Cambiar estado del paciente
export const updatePatientState = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body; // ACTIVO o INACTIVO

    const patient = await prisma.users.findUnique({ where: { id } });
    if (!patient) return res.status(404).json({ message: 'Paciente no encontrado' });

    const updated = await prisma.users.update({
      where: { id },
      data: { status },
    });

    res.json({ message: 'Estado actualizado correctamente', patient: updated });
  } catch (error) {
    console.error('Error al cambiar estado:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
};

// Listar pacientes (paginado)
export const listPatients = async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const [patients, total] = await Promise.all([
      prisma.users.findMany({
        where: { role: 'PACIENTE' },
        skip,
        take: Number(limit),
        orderBy: { createdAt: 'desc' },
      }),
      prisma.users.count({ where: { role: 'PACIENTE' } }),
    ]);

    res.json({
      total,
      page: Number(page),
      pages: Math.ceil(total / limit),
      patients,
    });
  } catch (error) {
    console.error('Error al listar pacientes:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
};

const createDiagnostic = async (req, res) => {
  const { patientId } = req.params;
  const doctorId = req.user.id; // viene del gateway
  const files = req.files || [];

  try {
    const FormData = (await import("form-data")).default;
    const formData = new FormData();

    // Agregar campos del body
    Object.entries(req.body).forEach(([key, value]) => formData.append(key, value));
    formData.append("patientId", patientId);
    formData.append("doctorId", doctorId);

    // Archivos
    for (const file of files) {
      formData.append("files", fs.createReadStream(file.path), file.originalname);
    }

    const response = await diagnosticClient.post(`/patients/${patientId}/diagnostics`, formData, {
      headers: {
        ...formData.getHeaders(),
        Authorization: req.headers.authorization, // JWT pasado por gateway
      },
    });

    // Limpiar archivos
    files.forEach(f => fs.unlinkSync(f.path));

    res.status(201).json({ message: "Diagnóstico creado", data: response.data });
  } catch (error) {
    files.forEach(f => {
      try { fs.unlinkSync(f.path); } catch { }
    });

    console.error("Error creando diagnóstico:", error.message);
    res.status(error.response?.status || 500).json({
      message: error.response?.data?.message || "Error al crear diagnóstico",
      details: error.message,
    });
  }
};


export const getPatientDiagnostics = async (req, res) => {
  const { patientId } = req.params;
  const user = req.user;

  try {
    // Validación de roles
    if (user.role === "ENFERMERO") {
      return res.status(403).json({ message: "Los enfermeros no tienen acceso a diagnósticos." });
    }

    if (user.role === "PACIENTE") {
      // Validar que el paciente solo vea sus propios diagnósticos
      const resp = await axios.get(`${PATIENT_SERVICE_URL}/patients/user/${user.id}`);
      if (!resp.data || resp.data.id !== patientId) {
        return res.status(403).json({ message: "No puedes ver diagnósticos de otros pacientes." });
      }
    }

    // Proxy hacia el Diagnostic Service
    const diagnosticsResp = await axios.get(`${DIAGNOSTIC_SERVICE_URL}/api/patients/${patientId}/diagnostics`, {
      headers: {
        Authorization: req.headers.authorization, // JWT del gateway
      },
    });

    res.json(diagnosticsResp.data);
  } catch (error) {
    console.error("Error obteniendo diagnósticos del paciente:", error.message);
    res.status(error.response?.status || 500).json({
      message: error.response?.data?.message || "Error interno al obtener diagnósticos.",
      details: error.message,
    });
  }
};

//======================ADVANCEDSEARCH=======================

export const advancedSearch = async (req, res) => {
  try {
    const { diagnostic, dateFrom, dateTo } = req.query;
    console.log("Parámetros recibidos:", { diagnostic, dateFrom, dateTo });

    // === 1. Normalizar fechas ===
    let gte, lte;
    if (dateFrom) {
      const d = new Date(dateFrom + "T00:00:00Z");
      if (isNaN(d.getTime())) return res.status(400).json({ message: "dateFrom inválida" });
      gte = d;
    }
    if (dateTo) {
      const d = new Date(dateTo + "T23:59:59Z");
      if (isNaN(d.getTime())) return res.status(400).json({ message: "dateTo inválida" });
      lte = d;
    }

    const params = {};
    if (diagnostic) params.diagnostic = diagnostic;
    if (gte) params.dateFrom = gte.toISOString().slice(0, 10);
    if (lte) params.dateTo = lte.toISOString().slice(0, 10);

    const headers = {};
    if (req.headers.authorization) headers["Authorization"] = req.headers.authorization;

    // === 2. Llamar a diagnostic-service ===
    let diagResp;
    try {
      diagResp = await axios.get(`${DIAGNOSTIC_SERVICE_URL}/api/v1/diagnostics/search`, {
        params,
        headers,
      });
    } catch (err) {
      console.error("Error consultando diagnostic-service:", err.message);
      const status = err.response?.status || 500;
      const msg = err.response?.data?.message || "Error contactando diagnostic-service";
      return res.status(status).json({ message: msg });
    }

    const diagnostics = Array.isArray(diagResp.data?.data) ? diagResp.data.data : [];
    console.log("Diagnósticos obtenidos:", diagnostics.length);

    const patientIds = [...new Set(diagnostics.map(d => String(d.patientId)).filter(Boolean))];
    if (patientIds.length === 0) {
      return res.status(200).json({ message: "Búsqueda completada", data: [] });
    }

    // === 3. Llamar a user-service (bulk) ===
    let users = [];
    try {
      const userResp = await axios.post(
        `${USER_SERVICE_URL}/api/v1/users/bulk`,
        { userIds: patientIds },
        { headers }
      );
      users = Array.isArray(userResp.data?.data) ? userResp.data.data : [];
    } catch (err) {
      console.warn("Error al obtener usuarios:", err.message);
      // Continúa sin usuarios
    }

    const userById = Object.fromEntries(users.map(u => [u.id, u]));

    // === 4. Enriquecer con diagnósticos ===
    const enriched = patientIds.map(id => {
      const user = userById[id];
      if (!user) return null; // Usuario no encontrado o no es paciente

      const patientDiagnostics = diagnostics.filter(d => String(d.patientId) === id);
      return {
        patient: user,
        diagnostics: patientDiagnostics,
      };
    }).filter(Boolean);

    // === 5. Ordenar por nombre ===
    enriched.sort((a, b) => {
      const nameA = a.patient.fullname ?? "";
      const nameB = b.patient.fullname ?? "";
      return nameA.localeCompare(nameB, "es", { sensitivity: "base" });
    });

    return res.status(200).json({
      message: "Búsqueda completada",
      data: enriched,
    });

  } catch (err) {
    console.error("Error en búsqueda avanzada:", err);
    return res.status(500).json({ success: false, message: "Error en búsqueda avanzada", error: err.message });
  }
};


export default {
  createPatient,
  getPatientById,
  updatePatient,
  updatePatientState,
  listPatients,
  createDiagnostic,
  getPatientDiagnostics,
  advancedSearch
};