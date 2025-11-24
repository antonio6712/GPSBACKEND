const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

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

// CORS PARA EXPRESS
app.use(cors({
  origin: "*",
  methods: ["GET", "POST", "OPTIONS"],
  credentials: false,
  allowedHeaders: ["Content-Type", "Authorization"]
}));

// Manejar preflight requests
app.options('*', cors());

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
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    cors: 'enabled',
    frontend: 'https://bucolic-cucurucho-09dba9.netlify.app'
  });
});

// Ruta de prueba de CORS
app.get('/api/cors-test', (req, res) => {
  res.json({
    message: '✅ CORS funcionando correctamente',
    timestamp: new Date().toISOString(),
    origin: req.headers.origin || 'No origin header'
  });
});

// Guardar ubicación
app.post('/api/location', async (req, res) => {
  try {
    const { userId, latitude, longitude, accuracy } = req.body;
    
    console.log('📍 Recibiendo ubicación desde:', req.headers.origin);
    console.log('📍 Datos:', { userId, latitude, longitude });

    // Validaciones
    if (!userId || latitude === undefined || longitude === undefined) {
      return res.status(400).json({ error: 'Datos incompletos' });
    }

    // Si la BD no está conectada
    if (mongoose.connection.readyState !== 1) {
      console.log('⚠️  BD no disponible - Modo offline');
      
      io.emit('locationUpdate', {
        userId,
        latitude,
        longitude,
        accuracy,
        timestamp: new Date()
      });
      
      return res.json({ 
        success: true, 
        message: 'Ubicación recibida (modo offline)',
        offline: true
      });
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
    
    res.json(users);
    
  } catch (error) {
    console.error('Error obteniendo usuarios admin:', error);
    res.json([]);
  }
});

// ==================== WEBSOCKETS ====================

io.on('connection', (socket) => {
  console.log('🔌 Cliente conectado:', socket.id, 'Desde:', socket.handshake.headers.origin);
  
  socket.on('join-admin-room', () => {
    socket.join('admin-room');
    console.log('👨‍💼 Admin conectado:', socket.id);
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
  console.log(`🌍 CORS: Habilitado para todos los orígenes`);
  console.log(`🗄️  Base de datos: MongoDB Atlas`);
  console.log('='.repeat(50));
});