import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';
import fs from 'fs';
import diagnosticClient from '../utils/diagnosticClient.js';

const prisma = new PrismaClient();

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
  const doctorId = req.user.id;
  const files = req.files || [];

  try {
    const FormData = (await import("form-data")).default;
    const formData = new FormData();

    // Agregar campos del body
    for (const key in req.body) {
      formData.append(key, req.body[key]);
    }

    formData.append("patientId", patientId);
    formData.append("doctorId", doctorId);

    // Agregar archivos
    for (const file of files) {
      formData.append("files", fs.createReadStream(file.path), file.originalname);
    }

    // Llamar al microservicio diagnostic
    const response = await diagnosticClient.post("/diagnostics", formData, {
      headers: formData.getHeaders(),
    });

    // Eliminar archivos temporales
    files.forEach(f => fs.unlinkSync(f.path));

    res.status(201).json({ message: "Diagnóstico creado", data: response.data });
  } catch (error) {
    // Eliminar archivos si hay error
    files.forEach(f => fs.unlinkSync(f.path));

    console.error("Error creando diagnóstico:", error);
    res.status(400).json({ message: error.response?.data?.message || error.message });
  }
};
export default {
  createPatient,
  getPatientById,
  updatePatient,
  updatePatientState,
  listPatients,
  createDiagnostic,
};