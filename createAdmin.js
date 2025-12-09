// createAdmin.js
const mongoose = require('mongoose');
require('dotenv').config();

async function createAdminUser() {
  try {
    console.log('🔗 Conectando a MongoDB...');
    
    // Usa la misma URI de tu .env
    await mongoose.connect(process.env.MONGODB_URI);
    
    // Definir esquema (igual que en server.js)
    const userSchema = new mongoose.Schema({
      username: { type: String, required: true, unique: true },
      password: { type: String, required: true },
      role: { type: String, enum: ['user', 'admin'], default: 'user' },
      createdAt: { type: Date, default: Date.now }
    });
    
    const User = mongoose.model('User', userSchema);
    
    // Crear usuario admin
    const adminUser = {
      username: "admin",
      password: "admin123", // ¡CÁMBIALO POR UNO SEGURO!
      role: "admin"
    };
    
    // Verificar si ya existe
    const existingAdmin = await User.findOne({ username: "admin" });
    
    if (existingAdmin) {
      console.log('⚠️  El usuario admin ya existe');
      console.log('Actualizando contraseña...');
      existingAdmin.password = adminUser.password;
      await existingAdmin.save();
    } else {
      // Crear nuevo admin
      const newAdmin = new User(adminUser);
      await newAdmin.save();
      console.log('✅ Usuario admin creado exitosamente');
    }
    
    console.log('👤 Datos del admin:');
    console.log(`Usuario: ${adminUser.username}`);
    console.log(`Contraseña: ${adminUser.password}`);
    console.log(`Rol: ${adminUser.role}`);
    
    // Cerrar conexión
    await mongoose.connection.close();
    console.log('✅ Conexión cerrada');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

// Ejecutar la función
createAdminUser();