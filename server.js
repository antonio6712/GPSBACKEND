const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
const jwt = require('jsonwebtoken');
require('dotenv').config();

// Importar modelos
const User = require('./models/User');
const Location = require('./models/Location');

const app = express();
const server = http.createServer(app);

// CORS CONFIGURADO CORRECTAMENTE
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
    credentials: false
  }
});

// CORS PARA EXPRESS - CONFIGURACIÓN SIMPLIFICADA
app.use(cors({
  origin: "*",
  methods: ["GET", "POST", "OPTIONS", "PUT", "DELETE"],
  credentials: false,
  allowedHeaders: ["Content-Type", "Authorization"]
}));

// Middleware para manejar preflight requests manualmente
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  next();
});

app.use(express.json());

// Conexión a MongoDB Atlas
const MONGODB_URI = process.env.MONGODB_URI;

console.log('🔗 Conectando a MongoDB Atlas...');

mongoose.connect(MONGODB_URI)
  .then(() => {
    console.log('✅ Conectado a MongoDB Atlas correctamente!');
  })
  .catch(err => {
    console.error('❌ Error conectando a MongoDB:', err.message);
  });

// ==================== MIDDLEWARE DE AUTENTICACIÓN ====================

const auth = {
  // Verificar token JWT
  verifyToken: (req, res, next) => {
    const authHeader = req.header('Authorization');
    const token = authHeader && authHeader.startsWith('Bearer ') 
      ? authHeader.substring(7) 
      : null;
    
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

// ==================== RUTAS PÚBLICAS ====================

// Ruta de prueba
app.get('/', (req, res) => {
  res.json({
    message: '🚀 GPS Tracker API funcionando!',
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    cors: 'enabled',
    version: '1.0.0',
    endpoints: {
      auth: '/api/auth/*',
      locations: '/api/location',
      admin: '/api/admin/*'
    }
  });
});

// Ruta de prueba de CORS
app.get('/api/cors-test', (req, res) => {
  res.json({
    message: '✅ CORS funcionando correctamente',
    timestamp: new Date().toISOString(),
    origin: req.headers.origin || 'No origin header',
    headers: req.headers
  });
});

// ==================== RUTAS DE AUTENTICACIÓN ====================

// Registrar nuevo usuario
app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password, username, fullName, phone, vehicle } = req.body;

    // Validaciones
    if (!email || !password || !username) {
      return res.status(400).json({ 
        success: false, 
        message: 'Email, contraseña y nombre de usuario son requeridos.' 
      });
    }

    // Verificar si el usuario ya existe
    const existingUser = await User.findOne({ 
      $or: [{ email }, { username }] 
    });

    if (existingUser) {
      return res.status(400).json({ 
        success: false, 
        message: 'El email o nombre de usuario ya están registrados.' 
      });
    }

    // Crear usuario
    const user = new User({
      email: email.toLowerCase(),
      password,
      username,
      role: 'user', // Por defecto es usuario normal
      profile: {
        fullName: fullName || '',
        phone: phone || '',
        vehicle: vehicle || '',
        avatarColor: `#${Math.floor(Math.random()*16777215).toString(16)}`
      },
      deviceId: `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    });

    await user.save();

    // Generar token JWT
    const token = jwt.sign(
      { 
        id: user._id, 
        email: user.email, 
        username: user.username, 
        role: user.role,
        deviceId: user.deviceId 
      },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '7d' }
    );

    res.status(201).json({
      success: true,
      message: 'Usuario registrado exitosamente.',
      user: {
        id: user._id,
        email: user.email,
        username: user.username,
        role: user.role,
        deviceId: user.deviceId,
        profile: user.profile
      },
      token
    });

  } catch (error) {
    console.error('Error en registro:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error en el servidor.', 
      error: error.message 
    });
  }
});

// Login de usuario - CORREGIDO
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validaciones
    if (!email || !password) {
      return res.status(400).json({ 
        success: false, 
        message: 'Email y contraseña son requeridos.' 
      });
    }

    // Buscar usuario
    const user = await User.findOne({ email: email.toLowerCase() });
    
    if (!user) {
      return res.status(401).json({ 
        success: false, 
        message: 'Credenciales inválidas.' 
      });
    }

    // Verificar contraseña
    const isMatch = await user.comparePassword(password);
    
    if (!isMatch) {
      return res.status(401).json({ 
        success: false, 
        message: 'Credenciales inválidas.' 
      });
    }

    // Actualizar último login SIN trigger del middleware
    user.lastLogin = new Date();
    
    // Guardar sin validar para evitar problemas con el middleware de password
    await user.save({ validateBeforeSave: false });

    // Generar token JWT
    const token = jwt.sign(
      { 
        id: user._id, 
        email: user.email, 
        username: user.username, 
        role: user.role,
        deviceId: user.deviceId 
      },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '7d' }
    );

    res.json({
      success: true,
      message: 'Login exitoso.',
      user: {
        id: user._id,
        email: user.email,
        username: user.username,
        role: user.role,
        deviceId: user.deviceId,
        profile: user.profile,
        lastLogin: user.lastLogin
      },
      token
    });

  } catch (error) {
    console.error('Error en login:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error en el servidor.', 
      error: error.message 
    });
  }
});

// Obtener perfil del usuario actual (protegido)
app.get('/api/auth/profile', auth.verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: 'Usuario no encontrado.' 
      });
    }

    res.json({
      success: true,
      user
    });

  } catch (error) {
    console.error('Error obteniendo perfil:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error en el servidor.' 
    });
  }
});

// ==================== RUTAS DE UBICACIONES ====================

// Guardar ubicación (protegida)
app.post('/api/location', auth.verifyToken, async (req, res) => {
  try {
    // Usar el userId del usuario autenticado
    const userId = req.user.deviceId || req.user.id;
    const { latitude, longitude, accuracy } = req.body;

    console.log('📍 Recibiendo ubicación para guardar:', { userId, latitude, longitude });

    // Validaciones básicas
    if (latitude === undefined || longitude === undefined) {
      return res.status(400).json({ 
        success: false, 
        error: 'Datos incompletos' 
      });
    }

    let location;

    // Guardar en BD siempre (sin filtros)
    if (mongoose.connection.readyState === 1) {
      location = new Location({
        userId: userId.toString(),
        latitude,
        longitude,
        accuracy: accuracy || 0
      });

      await location.save();
      console.log('💾 Ubicación GUARDADA en BD para usuario:', userId);
    }

    // Emitir por WebSocket
    io.emit('locationUpdate', {
      userId,
      latitude,
      longitude,
      accuracy: accuracy || 0,
      timestamp: location?.timestamp || new Date()
    });

    io.to('admin-room').emit('adminLocationUpdate', {
      userId,
      latitude,
      longitude,
      accuracy: accuracy || 0,
      timestamp: location?.timestamp || new Date(),
      type: 'user_update'
    });

    res.json({
      success: true,
      message: 'Ubicación procesada correctamente',
      saved: !!location
    });

  } catch (error) {
    console.error('❌ Error procesando ubicación:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor',
      details: error.message
    });
  }
});

// Obtener ubicaciones de un usuario (protegido)
app.get('/api/locations/:userId', auth.verifyToken, async (req, res) => {
  try {
    const { userId } = req.params;
    
    // Solo permitir ver ubicaciones propias o si es admin
    if (req.user.role !== 'admin' && req.user.deviceId !== userId && req.user.id !== userId) {
      return res.status(403).json({ 
        success: false, 
        message: 'No tienes permisos para ver estas ubicaciones.' 
      });
    }

    if (mongoose.connection.readyState !== 1) {
      return res.json([]);
    }

    const limit = parseInt(req.query.limit) || 50;
    const locations = await Location.find({ userId })
      .sort({ timestamp: -1 })
      .limit(limit);

    res.json(locations);

  } catch (error) {
    console.error('Error obteniendo ubicaciones:', error);
    res.json([]);
  }
});

// ==================== RUTAS DE ADMINISTRACIÓN (PROTEGIDAS) ====================

// Obtener TODOS los usuarios (solo admin)
app.get('/api/admin/users', auth.verifyToken, auth.isAdmin, async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.json([]);
    }

    const users = await Location.aggregate([
      {
        $sort: { timestamp: -1 }
      },
      {
        $group: {
          _id: "$userId",
          lastLocation: { $first: "$$ROOT" },
          locationCount: { $sum: 1 },
          firstSeen: { $min: "$timestamp" },
          lastSeen: { $max: "$timestamp" }
        }
      },
      {
        $project: {
          userId: "$_id",
          latitude: "$lastLocation.latitude",
          longitude: "$lastLocation.longitude",
          accuracy: "$lastLocation.accuracy",
          lastSeen: 1,
          firstSeen: 1,
          locationCount: 1,
          _id: 0
        }
      },
      {
        $sort: { lastSeen: -1 }
      }
    ]);

    console.log(`📊 Enviando ${users.length} usuarios al admin`);
    res.json(users);

  } catch (error) {
    console.error('Error obteniendo usuarios admin:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error obteniendo usuarios',
      error: error.message 
    });
  }
});

// Obtener historial completo de un usuario (solo admin)
app.get('/api/admin/user/:userId', auth.verifyToken, auth.isAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    const limit = parseInt(req.query.limit) || 500;

    if (mongoose.connection.readyState !== 1) {
      return res.json([]);
    }

    // ORDENAR POR TIMESTAMP ASCENDENTE para la línea temporal correcta
    const locations = await Location.find({ userId })
      .sort({ timestamp: 1 }) // Ascendente para ruta correcta
      .limit(limit);

    console.log(`📊 Enviando ${locations.length} ubicaciones para usuario: ${userId}`);
    res.json(locations);

  } catch (error) {
    console.error('Error obteniendo historial de usuario:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error interno del servidor',
      error: error.message 
    });
  }
});

// ==================== WEBSOCKETS ====================

io.on('connection', (socket) => {
  console.log('🔌 Cliente conectado:', socket.id, 'Desde:', socket.handshake.headers.origin);

  // Mapa temporal de usuarios conectados
  socket.on("register-user", (data) => {
    if (!data || !data.userId) return;

    socket.userId = data.userId.toString();

    console.log("🟢 Usuario registrado por WebSocket:", socket.userId);

    // Avisar a los admins que un usuario apareció
    io.to("admin-room").emit("adminLocationUpdate", {
      userId: socket.userId,
      type: "user_connected",
      timestamp: new Date()
    });
  });

  // Enviar ubicación por WebSocket
  socket.on("send-location", (loc) => {
    if (!loc || !loc.userId) return;

    console.log("📍 Ubicación recibida por WebSocket de:", loc.userId);

    // Reenviar a los admins
    io.to("admin-room").emit("adminLocationUpdate", {
      ...loc,
      type: "user_update",
      timestamp: new Date()
    });

    // Broadcast general por si lo necesitas
    io.emit("locationUpdate", {
      ...loc,
      timestamp: new Date()
    });

    // También guardar en la base de datos
    if (mongoose.connection.readyState === 1) {
      const location = new Location({
        userId: loc.userId,
        latitude: loc.latitude,
        longitude: loc.longitude,
        accuracy: loc.accuracy || 0
      });

      location.save().then(() => {
        console.log('💾 Ubicación WebSocket guardada para:', loc.userId);
      }).catch(err => {
        console.error('Error guardando ubicación WebSocket:', err);
      });
    }
  });

  // Admin se une a la sala
  socket.on('join-admin-room', () => {
    socket.join('admin-room');
    console.log('👨‍💼 Admin conectado:', socket.id);
  });

  socket.on('disconnect', () => {
    console.log('🔌 Cliente desconectado:', socket.id);

    if (socket.userId) {
      io.to("admin-room").emit("adminLocationUpdate", {
        userId: socket.userId,
        type: "user_disconnected",
        timestamp: new Date()
      });
    }
  });
});

// ==================== MANEJO DE ERRORES GLOBAL ====================

// Manejo de rutas no encontradas
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Ruta no encontrada',
    path: req.path,
    method: req.method
  });
});

// Manejo de errores global
app.use((err, req, res, next) => {
  console.error('❌ Error global:', err.stack);
  res.status(500).json({
    success: false,
    message: 'Error interno del servidor',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// ==================== INICIAR SERVIDOR ====================

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log('='.repeat(50));
  console.log('🚀 GPS TRACKER BACKEND INICIADO');
  console.log('='.repeat(50));
  console.log(`📍 Servidor: http://localhost:${PORT}`);
  console.log(`🌍 CORS: Habilitado para todos los orígenes`);
  console.log(`🗄️  Base de datos: MongoDB Atlas`);
  console.log(`🔐 Autenticación: JWT habilitado`);
  console.log('='.repeat(50));
});

// Manejo de cierre limpio
process.on('SIGINT', async () => {
  console.log('\n🔻 Cerrando servidor...');
  await mongoose.connection.close();
  console.log('✅ MongoDB desconectado');
  process.exit(0);
});