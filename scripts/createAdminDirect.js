const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config();

async function createAdminUser() {
  try {
    console.log('🔗 Conectando a MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    
    const db = mongoose.connection.db;
    
    // Verificar si ya existe el admin
    const adminExists = await db.collection('users').findOne({ email: 'admin@gps.com' });
    
    if (adminExists) {
      console.log('✅ Usuario admin ya existe');
      await mongoose.disconnect();
      process.exit(0);
    }
    
    // Encriptar contraseña
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash('admin123', salt);
    
    // Crear documento del admin
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
    
    // Insertar directamente en la colección
    const result = await db.collection('users').insertOne(admin);
    
    console.log('='.repeat(50));
    console.log('✅ USUARIO ADMIN CREADO EXITOSAMENTE');
    console.log('='.repeat(50));
    console.log('📧 Email: admin@gps.com');
    console.log('🔑 Contraseña: admin123');
    console.log('👤 Username: administrator');
    console.log('🎯 Rol: admin');
    console.log('🆔 ID:', result.insertedId);
    console.log('='.repeat(50));
    
    await mongoose.disconnect();
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Error creando usuario admin:', error.message);
    
    try {
      await mongoose.disconnect();
    } catch (e) {
      // Ignorar error de desconexión
    }
    
    process.exit(1);
  }
}

createAdminUser();