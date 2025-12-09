const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config();

async function createTestUser() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    const db = mongoose.connection.db;
    
    const users = [
      {
        email: 'usuario1@gps.com',
        password: await bcrypt.hash('usuario123', 10),
        username: 'usuario1',
        role: 'user',
        deviceId: `user_${Date.now()}_1`,
        createdAt: new Date(),
        lastLogin: new Date(),
        profile: {
          fullName: 'Usuario de Prueba 1',
          vehicle: 'Toyota Corolla',
          phone: '+1234567890'
        }
      },
      {
        email: 'conductor@gps.com',
        password: await bcrypt.hash('conductor123', 10),
        username: 'conductor',
        role: 'user',
        deviceId: `driver_${Date.now()}`,
        createdAt: new Date(),
        lastLogin: new Date(),
        profile: {
          fullName: 'Conductor Ejemplo',
          vehicle: 'Ford F-150',
          phone: '+1987654321'
        }
      }
    ];
    
    for (const user of users) {
      const exists = await db.collection('users').findOne({ email: user.email });
      if (!exists) {
        await db.collection('users').insertOne(user);
        console.log(`✅ Usuario creado: ${user.email}`);
      } else {
        console.log(`⚠️  Usuario ya existe: ${user.email}`);
      }
    }
    
    console.log('='.repeat(50));
    console.log('CREDENCIALES DE PRUEBA:');
    console.log('='.repeat(50));
    console.log('👑 ADMIN:');
    console.log('  Email: admin@gps.com');
    console.log('  Contraseña: admin123');
    console.log('='.repeat(50));
    console.log('👤 USUARIOS NORMALES:');
    console.log('  Email: usuario1@gps.com');
    console.log('  Contraseña: usuario123');
    console.log('  Email: conductor@gps.com');
    console.log('  Contraseña: conductor123');
    console.log('='.repeat(50));
    
    await mongoose.disconnect();
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

createTestUser();