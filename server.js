const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Middlewares
app.use(cors());
app.use(express.json());

// Conexión a MongoDB Atlas CON TUS DATOS
const MONGODB_URI = process.env.MONGODB_URI;

console.log('🔗 Intentando conectar a MongoDB Atlas...');

mongoose.connect(MONGODB_URI)
  .then(() => {
    console.log('✅ Conectado a MongoDB Atlas correctamente!');
    console.log('📊 Base de datos: gpstracker');
  })
  .catch(err => {
    console.error('❌ Error conectando a MongoDB:', err.message);
    console.log('💡 Verifica:');
    console.log('   1. Tu contraseña en el archivo .env');
    console.log('   2. Que tu IP esté en la whitelist de MongoDB Atlas');
    console.log('   3. Que el cluster esté activo');
  });

// Esquema para ubicaciones GPS
const locationSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  latitude: { type: Number, required: true },
  longitude: { type: Number, required: true },
  accuracy: Number,
  timestamp: { type: Date, default: Date.now }
});

const Location = mongoose.model('Location', locationSchema);

// ==================== RUTAS DE LA API ====================

// Ruta de prueba
app.get('/', (req, res) => {
  res.json({ 
    message: '🚀 GPS Tracker API funcionando!',
    version: '1.0.0',
    database: 'MongoDB Atlas',
    endpoints: {
      test: 'GET /api/test',
      saveLocation: 'POST /api/location',
      getUserLocations: 'GET /api/locations/:userId',
      getAllUsers: 'GET /api/admin/users'
    }
  });
});

// Ruta de prueba de base de datos
app.get('/api/test', async (req, res) => {
  try {
    // Verificar conexión a la base de datos
    const dbStatus = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
    
    // Contar ubicaciones guardadas
    const locationCount = await Location.countDocuments();
    
    res.json({
      database: dbStatus,
      locationsInDB: locationCount,
      message: '✅ Backend y base de datos funcionando correctamente'
    });
  } catch (error) {
    res.status(500).json({
      error: 'Error conectando a la base de datos',
      details: error.message
    });
  }
});

// Guardar ubicación
app.post('/api/location', async (req, res) => {
  try {
    const { userId, latitude, longitude, accuracy } = req.body;
    
    console.log('📍 Recibiendo ubicación:', { userId, latitude, longitude });
    
    // Validaciones
    if (!userId) {
      return res.status(400).json({ error: 'userId es requerido' });
    }
    if (latitude === undefined || longitude === undefined) {
      return res.status(400).json({ error: 'latitude y longitude son requeridos' });
    }

    const location = new Location({ 
      userId: userId.toString(), 
      latitude, 
      longitude, 
      accuracy: accuracy || 0 
    });
    
    await location.save();
    console.log('💾 Ubicación guardada en BD para usuario:', userId);
    
    // Emitir en tiempo real
    io.emit('locationUpdate', {
      userId,
      latitude,
      longitude,
      accuracy,
      timestamp: location.timestamp
    });
    
    // Emitir a admin
    io.to('admin-room').emit('adminLocationUpdate', {
      userId,
      latitude,
      longitude,
      accuracy,
      timestamp: location.timestamp,
      type: 'user_update'
    });

    res.json({ 
      success: true, 
      message: 'Ubicación guardada correctamente',
      data: location 
    });
    
  } catch (error) {
    console.error('❌ Error guardando ubicación:', error);
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
    const limit = parseInt(req.query.limit) || 50;
    
    const locations = await Location.find({ userId })
      .sort({ timestamp: -1 })
      .limit(limit);
    
    console.log(`📋 Obteniendo ${locations.length} ubicaciones para usuario: ${userId}`);
    
    res.json(locations);
    
  } catch (error) {
    console.error('Error obteniendo ubicaciones:', error);
    res.status(500).json({ error: 'Error obteniendo ubicaciones' });
  }
});

// Obtener TODOS los usuarios (PARA ADMIN)
app.get('/api/admin/users', async (req, res) => {
  try {
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
    
    console.log(`👥 Lista de usuarios obtenida: ${users.length} usuarios`);
    
    res.json(users);
    
  } catch (error) {
    console.error('Error obteniendo usuarios admin:', error);
    res.status(500).json({ error: 'Error obteniendo lista de usuarios' });
  }
});

// Obtener historial de usuario (PARA ADMIN)
app.get('/api/admin/user/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const limit = parseInt(req.query.limit) || 100;
    
    const locations = await Location.find({ userId })
      .sort({ timestamp: -1 })
      .limit(limit);
    
    res.json(locations);
    
  } catch (error) {
    console.error('Error obteniendo historial usuario:', error);
    res.status(500).json({ error: 'Error obteniendo historial del usuario' });
  }
});

// ==================== WEBSOCKETS ====================

io.on('connection', (socket) => {
  console.log('🔌 Cliente conectado:', socket.id);
  
  socket.on('join-admin-room', () => {
    socket.join('admin-room');
    console.log('👨‍💼 Admin conectado:', socket.id);
  });
  
  socket.on('leave-admin-room', () => {
    socket.leave('admin-room');
    console.log('👨‍💼 Admin desconectado:', socket.id);
  });
  
  socket.on('disconnect', () => {
    console.log('🔌 Cliente desconectado:', socket.id);
  });
});

// ==================== INICIAR SERVIDOR ====================

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log('='.repeat(50));
  console.log('🚀 GPS TRACKER BACKEND INICIADO');
  console.log('='.repeat(50));
  console.log(`📍 Servidor: http://localhost:${PORT}`);
  console.log(`🗄️  Base de datos: MongoDB Atlas`);
  console.log(`🌍 Entorno: ${process.env.NODE_ENV}`);
  console.log('='.repeat(50));
  console.log('📋 Endpoints disponibles:');
  console.log('   GET  /              - Página de inicio');
  console.log('   GET  /api/test      - Probar base de datos');
  console.log('   POST /api/location  - Guardar ubicación');
  console.log('   GET  /api/locations/:userId - Obtener ubicaciones');
  console.log('   GET  /api/admin/users - Panel administrador');
  console.log('='.repeat(50));
});