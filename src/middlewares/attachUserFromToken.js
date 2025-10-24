import jwt from "jsonwebtoken";

export const attachUserFromToken = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) return next();

    const token = authHeader.split(" ")[1];
    if (!token) return next();

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = { id: decoded.id, role: decoded.role }; // Solo extraemos info necesaria
    next();
  } catch (err) {
    console.error("Error decodificando token en Patient Service:", err);
    next();
  }
};
