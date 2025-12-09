const mongoose = require('mongoose');
const User = require('../models/User');
require('dotenv').config();

async function createAdminUser() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    
    const adminExists = await User.findOne({ email: 'admin@gps.com' });
    
    if (adminExists) {
      console.log('✅ Usuario admin ya existe');
      process.exit(0);
    }
    
    const admin = new User({
      email: 'admin@gps.com',
      password: 'admin123', // Se encriptará automáticamente
      username: 'administrator',
      role: 'admin',
      profile: {
        fullName: 'Administrador del Sistema'
      }
    });
    
    await admin.save();
    
    console.log('✅ Usuario admin creado exitosamente');
    console.log('📧 Email: admin@gps.com');
    console.log('🔑 Contraseña: admin123');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error creando usuario admin:', error);
    process.exit(1);
  }
}

createAdminUser();