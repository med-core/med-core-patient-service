import axios from "axios";

export const verifyToken = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) {
      return res.status(401).json({ error: "Token no proporcionado" });
    }

    // Llamada al microservicio Auth para validar el token
    const response = await axios.get("http://med-core-auth-service:3000/api/v1/auth/verify", {
      headers: { Authorization: `Bearer ${token}` },
    });

    // Si el token es válido, agrega los datos del usuario a la request
    req.user = response.data.user;
    next();
  } catch (error) {
    console.error("Error verificando token:", error.response?.data || error.message);
    return res.status(401).json({ error: "Token inválido o expirado" });
  }
};
