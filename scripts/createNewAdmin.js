const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config();

async function createNewAdmin() {
  try {
    console.log('🔗 Conectando a MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    
    // Eliminar admin existente si hay problemas
    await mongoose.connection.db.collection('users').deleteOne({ 
      email: 'admin@gps.com' 
    });
    
    console.log('🧹 Admin anterior eliminado (si existía)');
    
    // Encriptar contraseña
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash('admin123', salt);
    
    // Crear nuevo admin
    const admin = {
      email: 'admin@gps.com',
      password: hashedPassword,
      username: 'administrator',
      role: 'admin',
      deviceId: `admin_${Date.now()}`,
      createdAt: new Date(),
      lastLogin: new Date(),
      profile: {
        fullName: 'Administrador del Sistema',
        avatarColor: '#FF6B6B'
      }
    };
    
    // Insertar directamente
    const result = await mongoose.connection.db.collection('users').insertOne(admin);
    
    console.log('='.repeat(50));
    console.log('✅ NUEVO USUARIO ADMIN CREADO');
    console.log('='.repeat(50));
    console.log('📧 Email: admin@gps.com');
    console.log('🔑 Contraseña: admin123');
    console.log('👤 Username: administrator');
    console.log('🎯 Rol: admin');
    console.log('='.repeat(50));
    
    await mongoose.disconnect();
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

createNewAdmin();