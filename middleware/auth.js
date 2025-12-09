const jwt = require('jsonwebtoken');

const auth = {
  // Verificar token JWT
  verifyToken: (req, res, next) => {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ 
        success: false, 
        message: 'Acceso denegado. No hay token.' 
      });
    }

    try {
      const verified = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
      req.user = verified;
      next();
    } catch (error) {
      return res.status(401).json({ 
        success: false, 
        message: 'Token inválido o expirado.' 
      });
    }
  },

  // Verificar si es administrador
  isAdmin: (req, res, next) => {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ 
        success: false, 
        message: 'Acceso denegado. Se requieren permisos de administrador.' 
      });
    }
    next();
  },

  // Verificar si es usuario normal
  isUser: (req, res, next) => {
    if (req.user.role !== 'user') {
      return res.status(403).json({ 
        success: false, 
        message: 'Acceso denegado.' 
      });
    }
    next();
  }
};

module.exports = auth;