# School ERP Backend Fix - TODO List

## Task: Complete backend fix for Student/Parent Login, Timetable, Permissions, and Seeding

### Phase 1: Model Updates
- [x] 1.1 Update Student.js - Add classId field as virtual/alias
- [x] 1.2 Update Parent.js - Already supports childId

### Phase 2: Controller Implementation
- [x] 2.1 Create studentController.js - Add studentLogin function
- [x] 2.2 Create studentController.js - Add getStudentTimetable function
- [x] 2.3 Update parentController.js - Add parentLogin function

### Phase 3: Route Creation
- [x] 3.1 Update studentRoutes.js - /login, /timetable/:studentId endpoints
- [x] 3.2 Create parentRoutes.js - /login and related endpoints
- [x] 3.3 Update server.js - Register new routes

### Phase 4: Seed Script Updates
- [x] 4.1 Parent seeding code added to pro-seed-optimized.js

### Phase 5: Testing & Validation
- [ ] 5.1 Test Student Login endpoint
- [ ] 5.2 Test Parent Login endpoint
- [ ] 5.3 Test Timetable Fetch endpoint
- [ ] 5.4 Verify permissions and error handling

---

## Endpoints Created:
1. POST /api/student/login - Student login
2. GET /api/student/timetable/:studentId - Fetch student timetable
3. POST /api/parent/login - Parent login
4. GET /api/parent/students - Get linked students

## Additional Routes:
- POST /api/parent/login - Parent login
- GET /api/parent/students - Get linked students
- GET /api/parent/profile - Get parent profile
- GET /api/parent/child - Get child info
- GET /api/parent/attendance - Get child's attendance
- GET /api/parent/grades - Get child's grades
- GET /api/parent/homework - Get child's homework
- GET /api/parent/dashboard - Get parent dashboard

