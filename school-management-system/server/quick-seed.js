const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const MONGO_URI = "mongodb://localhost:27017/school_management";

const userSchema = new mongoose.Schema({
  fullName: { type: String, required: true },
  email: { type: String, required: true, unique: true, lowercase: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['admin', 'teacher', 'student', 'parent'], default: 'student' },
}, { timestamps: true });

const User = mongoose.model('User', userSchema);

async function seed() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGO_URI);
    console.log('Connected!');

    // Create test users
    const password = await bcrypt.hash('Mayo@123', 10);

    const users = [
      { fullName: 'Gagan Goyal (Admin)', email: 'gagan.admin@mayo.edu', password, role: 'admin' },
      { fullName: 'Vikram Rathore', email: 'vikram.teacher@mayo.edu', password, role: 'teacher' },
      { fullName: 'Arjun Pratap', email: 'arjun.teacher@mayo.edu', password, role: 'teacher' },
      { fullName: 'Aarav Sharma', email: 'aarav@mayo.edu', password, role: 'student' },
      { fullName: 'Riya Nair', email: 'riya@mayo.edu', password, role: 'student' },
      { fullName: 'Kabir Mehta', email: 'kabir@mayo.edu', password, role: 'student' },
    ];

    for (const userData of users) {
      const exists = await User.findOne({ email: userData.email });
      if (!exists) {
        await User.create(userData);
        console.log(`Created: ${userData.email}`);
      } else {
        console.log(`Exists: ${userData.email}`);
      }
    }

    console.log('\n✅ Seed Complete!');
    console.log('Login with any of:');
    console.log('  Admin: gagan.admin@mayo.edu / Mayo@123');
    console.log('  Teacher: vikram.teacher@mayo.edu / Mayo@123');
    console.log('  Student: aarav@mayo.edu / Mayo@123');
    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

seed();

