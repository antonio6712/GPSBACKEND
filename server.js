const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const mongoose = require('mongoose');
require('dotenv').config();

const app = express();
const server = http.createServer(app);

// CORS para Socket.IO
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
    credentials: false
  }
});

// ==================== CORS MIDDLEWARE MANUAL ====================
app.use((req, res, next) => {
  // Log de la solicitud para debugging
  console.log(`${req.method} ${req.url} - Origin: ${req.headers.origin || 'No origin'}`);
  
  // Permitir todos los orígenes
  res.header('Access-Control-Allow-Origin', '*');
  
  // Headers permitidos
  res.header('Access-Control-Allow-Headers', 
    'Origin, X-Requested-With, Content-Type, Accept, Authorization'
  );
  
  // Métodos permitidos
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  
  // Manejar preflight OPTIONS
  if (req.method === 'OPTIONS') {
    console.log('Handling OPTIONS preflight request');
    return res.status(200).json({});
  }
  
  next();
});

app.use(express.json());

// ==================== CONEXIÓN A MONGODB ====================
const MONGODB_URI = process.env.MONGODB_URI;

console.log('='.repeat(50));
console.log('🔧 INICIANDO SERVIDOR GPS TRACKER');
console.log('='.repeat(50));
console.log('🔍 Variables de entorno:');
console.log('   NODE_ENV:', process.env.NODE_ENV || 'development');
console.log('   PORT:', process.env.PORT || 3000);
console.log('   MONGODB_URI:', MONGODB_URI ? 'PRESENTE' : 'FALTANTE!');
console.log('='.repeat(50));

if (!MONGODB_URI) {
  console.error('❌ ERROR CRÍTICO: MONGODB_URI no está definida');
  console.error('💡 Crea un archivo .env con:');
  console.error('   MONGODB_URI=mongodb+srv://usuario:contraseña@cluster.mongodb.net/');
  process.exit(1);
}

console.log('🔗 Conectando a MongoDB Atlas...');

mongoose.connect(MONGODB_URI, {
  serverSelectionTimeoutMS: 10000,
  socketTimeoutMS: 45000,
  family: 4
})
  .then(() => {
    console.log('✅ Conectado a MongoDB Atlas correctamente!');
    console.log('📊 Base de datos:', mongoose.connection.db?.databaseName);
  })
  .catch(err => {
    console.error('❌ Error CRÍTICO conectando a MongoDB:', err.message);
    console.error('💡 Verifica:');
    console.error('   1. Tu conexión a internet');
    console.error('   2. La URL en .env');
    console.error('   3. Que tu IP esté en la whitelist de MongoDB Atlas');
    console.error('   4. Las credenciales de usuario');
    process.exit(1);
  });

// Eventos de conexión MongoDB
mongoose.connection.on('error', err => {
  console.error('❌ Error de conexión MongoDB:', err);
});

mongoose.connection.on('disconnected', () => {
  console.warn('⚠️  Desconectado de MongoDB');
});

// ==================== ESQUEMAS ====================

// Esquema para ubicaciones GPS
const locationSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  latitude: { type: Number, required: true },
  longitude: { type: Number, required: true },
  accuracy: Number,
  timestamp: { type: Date, default: Date.now }
});

const Location = mongoose.model('Location', locationSchema);

// Esquema para usuarios - CON EMAIL REQUERIDO Y ÚNICO
const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['user', 'admin'], default: 'user' },
  createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);

// ==================== RUTAS DE LA API ====================

// Ruta de prueba
app.get('/', (req, res) => {
  res.json({
    message: '🚀 GPS Tracker API funcionando!',
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    status: 'online',
    timestamp: new Date().toISOString(),
    endpoints: [
      'POST /api/login',
      'POST /api/register',
      'POST /api/location',
      'GET /api/locations/:userId',
      'GET /api/admin/users',
      'GET /api/admin/user/:userId',
      'GET /api/debug/users'
    ]
  });
});

// Endpoint de prueba CORS
app.get('/api/cors-test', (req, res) => {
  res.json({
    message: '✅ CORS funcionando correctamente',
    timestamp: new Date().toISOString(),
    origin: req.headers.origin || 'No origin header'
  });
});

// ==================== AUTENTICACIÓN ====================

// Verificar si usuario o email existen
app.get('/api/users/:identifier', async (req, res) => {
  try {
    const { identifier } = req.params;
    
    // Determinar si es email o username
    const isEmail = identifier.includes('@');
    
    let user;
    if (isEmail) {
      user = await User.findOne({ email: identifier.trim().toLowerCase() });
    } else {
      user = await User.findOne({ username: identifier.trim() });
    }
    
    res.json({
      exists: !!user,
      username: user?.username || null,
      email: user?.email || null,
      role: user?.role || null
    });
    
  } catch (error) {
    console.error('Error verificando usuario:', error);
    res.status(500).json({ 
      error: 'Error interno del servidor',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Registrar usuario - VERSIÓN CON EMAIL REQUERIDO
app.post('/api/register', async (req, res) => {
  try {
    const { username, email, password, role } = req.body;
    
    console.log('📝 Intentando registrar usuario:', { username, email: email || 'no email' });
    
    // Validaciones básicas
    if (!username || !password) {
      return res.status(400).json({ 
        success: false, 
        error: 'Usuario y contraseña son requeridos' 
      });
    }
    
    if (!email) {
      return res.status(400).json({ 
        success: false, 
        error: 'Email es requerido' 
      });
    }
    
    // Validar formato de email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      return res.status(400).json({ 
        success: false, 
        error: 'Formato de email inválido' 
      });
    }
    
    if (username.length < 3) {
      return res.status(400).json({ 
        success: false, 
        error: 'El usuario debe tener al menos 3 caracteres' 
      });
    }
    
    if (password.length < 4) {
      return res.status(400).json({ 
        success: false, 
        error: 'La contraseña debe tener al menos 4 caracteres' 
      });
    }
    
    // Verificar si usuario existe
    const existingUsername = await User.findOne({ username: username.trim() });
    if (existingUsername) {
      return res.status(400).json({ 
        success: false, 
        error: 'El nombre de usuario ya está registrado' 
      });
    }
    
    // Verificar si email existe
    const existingEmail = await User.findOne({ email: email.trim().toLowerCase() });
    if (existingEmail) {
      return res.status(400).json({ 
        success: false, 
        error: 'El email ya está registrado' 
      });
    }
    
    // Crear usuario
    const user = new User({
      username: username.trim(),
      email: email.trim().toLowerCase(),
      password: password,
      role: role || 'user'
    });
    
    await user.save();
    
    console.log('✅ Usuario registrado exitosamente:', username);
    
    res.json({
      success: true,
      message: 'Usuario registrado exitosamente',
      user: { 
        id: user._id,
        username: user.username,
        email: user.email,
        role: user.role 
      }
    });
    
  } catch (error) {
    console.error('❌ Error registrando usuario:', error);
    
    if (error.code === 11000) {
      // Determinar qué campo causó el error de duplicado
      if (error.keyPattern?.email) {
        return res.status(400).json({ 
          success: false, 
          error: 'El email ya está registrado' 
        });
      }
      if (error.keyPattern?.username) {
        return res.status(400).json({ 
          success: false, 
          error: 'El nombre de usuario ya está registrado' 
        });
      }
    }
    
    res.status(500).json({ 
      success: false, 
      error: 'Error interno del servidor',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Login - VERSIÓN SIMPLIFICADA
app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    console.log('🔑 Intentando login para:', username);
    
    // Validaciones básicas
    if (!username || !password) {
      return res.status(400).json({ 
        success: false, 
        error: 'Usuario y contraseña son requeridos' 
      });
    }
    
    // Buscar usuario
    const user = await User.findOne({ username: username.trim() });
    if (!user) {
      console.log('❌ Usuario no encontrado:', username);
      return res.status(401).json({ 
        success: false, 
        error: 'Usuario o contraseña incorrectos' 
      });
    }
    
    // Verificar contraseña
    if (user.password !== password.trim()) {
      console.log('❌ Contraseña incorrecta para:', username);
      return res.status(401).json({ 
        success: false, 
        error: 'Usuario o contraseña incorrectos' 
      });
    }
    
    console.log('✅ Login exitoso:', username, 'Rol:', user.role);
    
    res.json({
      success: true,
      user: {
        id: user._id,
        username: user.username,
        role: user.role
      }
    });
    
  } catch (error) {
    console.error('❌ Error en login:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Error interno del servidor' 
    });
  }
});

// Endpoint para debug - listar usuarios
app.get('/api/debug/users', async (req, res) => {
  try {
    const users = await User.find({}).sort({ createdAt: -1 });
    res.json({
      count: users.length,
      users: users.map(u => ({
        id: u._id,
        username: u.username,
        role: u.role,
        createdAt: u.createdAt
      }))
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Verificar si usuario existe
app.get('/api/users/:username', async (req, res) => {
  try {
    const { username } = req.params;
    const user = await User.findOne({ username: username.trim() });
    
    res.json({
      exists: !!user,
      username: user?.username || null,
      role: user?.role || null
    });
    
  } catch (error) {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// ==================== RUTAS DE UBICACIÓN ====================

// Guardar ubicación
app.post('/api/location', async (req, res) => {
  try {
    const { userId, latitude, longitude, accuracy } = req.body;

    console.log('📍 Recibiendo ubicación para guardar:', { userId, latitude, longitude });

    // Validaciones básicas
    if (!userId || latitude === undefined || longitude === undefined) {
      return res.status(400).json({ error: 'Datos incompletos' });
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

    // EMITIR SIEMPRE, incluso si no se guardó en BD
    io.emit('locationUpdate', {
      userId,
      latitude,
      longitude,
      accuracy,
      timestamp: location?.timestamp || new Date()
    });

    io.to('admin-room').emit('adminLocationUpdate', {
      userId,
      latitude,
      longitude,
      accuracy,
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
      error: 'Error interno del servidor',
      details: error.message
    });
  }
});

// Obtener ubicaciones de un usuario
app.get('/api/locations/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

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

// ==================== RUTAS DE ADMINISTRACIÓN ====================

// Obtener TODOS los usuarios (PARA ADMIN)
app.get('/api/admin/users', async (req, res) => {
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
    res.json([]);
  }
});

// Obtener historial completo de un usuario (PARA ADMIN)
app.get('/api/admin/user/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const limit = parseInt(req.query.limit) || 500;

    if (mongoose.connection.readyState !== 1) {
      return res.json([]);
    }

    // ORDENAR POR TIMESTAMP ASCENDENTE para la línea temporal correcta
    const locations = await Location.find({ userId })
      .sort({ timestamp: 1 })
      .limit(limit);

    console.log(`📊 Enviando ${locations.length} ubicaciones para usuario: ${userId}`);
    res.json(locations);

  } catch (error) {
    console.error('Error obteniendo historial de usuario:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
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

// Manejo de errores 404
app.use((req, res, next) => {
  res.status(404).json({
    error: 'Ruta no encontrada',
    path: req.url,
    method: req.method
  });
});

// Manejo de errores generales
app.use((err, req, res, next) => {
  console.error('❌ Error no manejado:', err);
  res.status(500).json({
    error: 'Error interno del servidor',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
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
  console.log(`👥 Autenticación: Activada (Login/Register)`);
  console.log(`📡 WebSocket: Socket.IO activo`);
  console.log('='.repeat(50));
  console.log('📋 Endpoints disponibles:');
  console.log('  POST /api/login');
  console.log('  POST /api/register');
  console.log('  POST /api/location');
  console.log('  GET  /api/admin/users');
  console.log('  GET  /api/admin/user/:userId');
  console.log('  GET  /api/debug/users (para testing)');
  console.log('='.repeat(50));
});

// Manejo de señales para shutdown limpio
process.on('SIGINT', () => {
  console.log('\n🛑 Recibida señal SIGINT. Cerrando servidor...');
  mongoose.connection.close();
  server.close(() => {
    console.log('✅ Servidor cerrado correctamente');
    process.exit(0);
  });
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Recibida señal SIGTERM. Cerrando servidor...');
  mongoose.connection.close();
  server.close(() => {
    console.log('✅ Servidor cerrado correctamente');
    process.exit(0);
  });
});