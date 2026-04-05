// =============== INITIAL PRELOADER ===============
window.addEventListener('load', () => {
    const preloader = document.getElementById('initial-preloader');
    if (preloader) {
        preloader.classList.add('fade-out');
        // Optional: remove from DOM completely after transition
        setTimeout(() => {
            preloader.style.display = 'none';
        }, 600);
    }
});

// =============== FIREBASE CONFIGURATION ===============
// Placeholder - MUST be filled with actual Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyCuARnp-Oe4VRCkkDS8IDt8CYmShG4Iugo",
    authDomain: "oystre-kode-club.firebaseapp.com",
    projectId: "oystre-kode-club",
    storageBucket: "oystre-kode-club.firebasestorage.app",
    messagingSenderId: "1070374612686",
    appId: "1:1070374612686:web:1586415f8c5211b4036a9f",
    measurementId: "G-2V413HPR2M"
};

// Initialize Firebase
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const auth = firebase.auth();
const db = firebase.firestore();

// =============== APP STATE ===============
let currentUser = null;
let currentBatchId = null;
let currentBatchName = null;
let studentsData = [];
let pendingAttendance = {};
// Auto-get today's date in YYYY-MM-DD format
let selectedDate = new Date().toISOString().split('T')[0];

let barChart = null;
let pieChart = null;

// =============== DOM ELEMENTS ===============
// Auth / Global views
const authSection = document.getElementById('auth-section');
const dashboardSection = document.getElementById('dashboard-section');
const loader = document.getElementById('loader');

// User details
const userNameEl = document.getElementById('user-name');
const userRoleEl = document.getElementById('user-role');
const userClubIdEl = document.getElementById('user-club-id');

// Batches view
const batchesView = document.getElementById('batches-view');
const batchesList = document.getElementById('batches-list');

// Students view
const studentsView = document.getElementById('students-view');
const currentBatchNameEl = document.getElementById('current-batch-name');
const currentDateEl = document.getElementById('current-date');
const studentsList = document.getElementById('students-list');

// Summary
const totalPresentEl = document.getElementById('total-present');
const totalAbsentEl = document.getElementById('total-absent');
const totalStudentsEl = document.getElementById('total-students');
const attendancePercentEl = document.getElementById('attendance-percent');
const analyticsPanel = document.querySelector('.analytics-panel');

// Inputs and Forms
const loginForm = document.getElementById('login-form');
const authError = document.getElementById('auth-error');
const searchStudentInput = document.getElementById('search-student');
const studentForm = document.getElementById('student-form');
const studentModal = document.getElementById('student-modal');
const passwordInput = document.getElementById('password');
const togglePasswordIcon = document.getElementById('toggle-password');

// Password Visibility Toggle
if (togglePasswordIcon && passwordInput) {
    togglePasswordIcon.addEventListener('click', () => {
        if (passwordInput.type === 'password') {
            passwordInput.type = 'text';
            togglePasswordIcon.style.color = '#fff';
        } else {
            passwordInput.type = 'password';
            togglePasswordIcon.style.color = 'var(--text-muted)';
        }
    });
}

// Modal inputs
const modalTitle = document.getElementById('modal-title');
const studentIdInput = document.getElementById('student-id');
const studentNameInput = document.getElementById('student-name');
const studentClubIdInput = document.getElementById('student-club-id');
const studentError = document.getElementById('student-error');

// Init UI elements
currentDateEl.value = selectedDate;

currentDateEl.addEventListener('change', (e) => {
    if (e.target.value) {
        selectedDate = e.target.value;
        pendingAttendance = {}; // Reset pending changes if date switches
        if (currentBatchId) {
            renderStudents(searchStudentInput.value);
        }
    } else {
        // If user clears the date somehow, revert safely
        e.target.value = selectedDate;
    }
});

// Helper loaders
function showLoader() { loader.classList.remove('hidden'); }
function hideLoader() { loader.classList.add('hidden'); }

// =============== AUTHENTICATION LOGIC ===============
auth.onAuthStateChanged(async (user) => {
    if (user) {
        showLoader();
        try {
            const userDoc = await db.collection('users').doc(user.uid).get();
            if (userDoc.exists) {
                currentUser = userDoc.data();
                currentUser.uid = user.uid;
            } else {
                currentUser = {
                    uid: user.uid,
                    name: user.displayName || user.email.split('@')[0],
                    role: "Admin",
                    clubId: "N/A"
                };
            }

            // Update UI User Profile
            userNameEl.innerText = currentUser.name || user.email.split('@')[0];
            userRoleEl.innerText = currentUser.role || "Admin";
            userClubIdEl.innerText = "ID: " + (currentUser.clubId || "N/A");

            authSection.classList.add('hidden');
            dashboardSection.classList.remove('hidden');

            loadBatches();
        } catch (error) {
            authError.innerText = "Error fetching user data: " + error.message;
            auth.signOut();
        }
        hideLoader();
    } else {
        authSection.classList.remove('hidden');
        dashboardSection.classList.add('hidden');
        currentUser = null;
    }
});

loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;

    showLoader();
    try {
        await auth.signInWithEmailAndPassword(email, password);
        authError.innerText = "";
    } catch (error) {
        authError.innerText = error.message;
        hideLoader();
    }
});

document.getElementById('logout-btn').addEventListener('click', () => {
    auth.signOut();
});

// =============== BATCH MANAGEMENT ===============
async function loadBatches() {
    showLoader();
    try {
        const snapshot = await db.collection('batches').get();
        batchesList.innerHTML = '';

        if (snapshot.empty) {
            batchesList.innerHTML = '<p style="text-align:center; grid-column: 1/-1;">No batches found in Firestore.</p>';
        } else {
            snapshot.forEach(doc => {
                const batch = doc.data();
                const div = document.createElement('div');
                div.className = 'batch-card';

                const titleSpan = document.createElement('span');
                titleSpan.className = 'batch-title';
                titleSpan.innerText = batch.name || `Batch ${doc.id}`;

                const deleteBtn = document.createElement('button');
                deleteBtn.className = 'batch-delete-btn';
                deleteBtn.innerHTML = '🗑️';
                deleteBtn.title = 'Delete Batch';
                deleteBtn.onclick = async (e) => {
                    e.stopPropagation(); // Prevent opening the batch
                    if (confirm(`Are you sure you want to delete the "${batch.name || `Batch ${doc.id}`}" batch?\nThis action cannot be undone.`)) {
                        showLoader();
                        try {
                            await db.collection('batches').doc(doc.id).delete();
                            loadBatches();
                        } catch (error) {
                            console.error("Error deleting batch:", error);
                            alert("Failed to delete batch.");
                        }
                        hideLoader();
                    }
                };

                div.appendChild(titleSpan);
                div.appendChild(deleteBtn);
                div.onclick = () => openBatch(doc.id, batch.name);
                batchesList.appendChild(div);
            });
        }
    } catch (error) {
        console.error("Error loading batches:", error);
    }
    hideLoader();
}

const batchModal = document.getElementById('batch-modal');
const batchForm = document.getElementById('batch-form');
const batchNameInput = document.getElementById('batch-name');
const batchError = document.getElementById('batch-error');
const closeBatchBtn = document.getElementById('close-batch-modal');

document.getElementById('add-batch-btn').addEventListener('click', () => {
    batchForm.reset();
    batchError.innerText = "";
    batchModal.classList.remove('hidden');
    batchNameInput.focus();
});

if (closeBatchBtn) {
    closeBatchBtn.addEventListener('click', () => {
        batchModal.classList.add('hidden');
    });
}

if (batchForm) {
    batchForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const batchName = batchNameInput.value.trim();
        if (batchName !== '') {
            batchError.innerText = "";
            showLoader();
            try {
                await db.collection('batches').add({ name: batchName });
                batchModal.classList.add('hidden');
                loadBatches();
            } catch (error) {
                console.error("Error adding batch:", error);
                batchError.innerText = "Failed to add batch.";
            }
            hideLoader();
        }
    });
}

// =============== STUDENT MANAGEMENT & ATTENDANCE ===============
function openBatch(batchId, batchName) {
    currentBatchId = batchId;
    currentBatchName = batchName;
    currentBatchNameEl.innerText = batchName;

    pendingAttendance = {}; // Reset local cache

    batchesView.classList.add('hidden');
    studentsView.classList.remove('hidden');
    searchStudentInput.value = "";

    loadStudents();
}

document.getElementById('back-to-batches').addEventListener('click', () => {
    studentsView.classList.add('hidden');
    batchesView.classList.remove('hidden');
    currentBatchId = null;
    currentBatchName = null;
});

let unsubscribeStudents = null;

function loadStudents() {
    showLoader();
    // Unsubscribe from previous listener if going between batches
    if (unsubscribeStudents) unsubscribeStudents();

    try {
        unsubscribeStudents = db.collection('batches').doc(currentBatchId).collection('students')
            .onSnapshot(snapshot => {
                studentsData = [];
                snapshot.forEach(doc => {
                    studentsData.push({ id: doc.id, ...doc.data() });
                });

                // 8. EXTRA RULES: Automatically SORT students by clubId
                studentsData.sort((a, b) => a.clubId.localeCompare(b.clubId));

                renderStudents(searchStudentInput.value);
                hideLoader();
            }, error => {
                console.error("Error listening to students:", error);
                hideLoader();
            });
    } catch (error) {
        console.error("Error setting up students listener:", error);
        hideLoader();
    }
}

function renderStudents(filterText = "") {
    studentsList.innerHTML = '';
    let presentCount = 0;
    let absentCount = 0;

    const lowerFilter = filterText.toLowerCase();
    const filteredStudents = studentsData.filter(s => s.clubId.toLowerCase().includes(lowerFilter));

    filteredStudents.forEach(student => {
        // Find attendance for selectedDate FIRST looking at local changes
        let attendance = pendingAttendance[student.id];
        if (attendance === undefined) {
            attendance = student.attendance && student.attendance[selectedDate] ? student.attendance[selectedDate] : null;
        }

        if (attendance === "Present") presentCount++;
        if (attendance === "Absent") absentCount++;

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>${student.clubId}</strong></td>
            <td>${student.name}</td>
            <td>
                <div class="attendance-actions">
                    <button class="present-btn ${attendance === 'Present' ? 'active' : ''}" 
                            onclick="markAttendance('${student.id}', 'Present')">P</button>
                    <button class="absent-btn ${attendance === 'Absent' ? 'active' : ''}" 
                            onclick="markAttendance('${student.id}', 'Absent')">A</button>
                </div>
            </td>
            <td>
                <div class="attendance-actions">
                    <button class="action-btn edit" onclick="editStudent('${student.id}')">Edit</button>
                    <button class="action-btn delete" onclick="deleteStudent('${student.id}')">Delete</button>
                </div>
            </td>
        `;
        studentsList.appendChild(tr);
    });

    // Update Summaries
    totalStudentsEl.innerText = filteredStudents.length;
    totalPresentEl.innerText = presentCount;
    totalAbsentEl.innerText = absentCount;

    // Percentage Calculation
    const percentage = filteredStudents.length > 0 ? Math.round((presentCount / filteredStudents.length) * 100) : 0;
    attendancePercentEl.innerText = percentage + "%";

    // Render Analytics Charts
    renderCharts(presentCount, absentCount, filteredStudents);
}

function renderCharts(presentCount, absentCount, currentStudents) {
    if (analyticsPanel) analyticsPanel.classList.remove('hidden');

    // Global Chart Defaults
    Chart.defaults.color = '#8b92a5';
    Chart.defaults.font.family = "'Inter', sans-serif";

    // 1. Pie Chart - Selected Date Distribution
    const pieCtx = document.getElementById('pie-chart').getContext('2d');
    if (pieChart) pieChart.destroy();

    pieChart = new Chart(pieCtx, {
        type: 'doughnut',
        data: {
            labels: ['Present', 'Absent'],
            datasets: [{
                data: [presentCount, absentCount],
                backgroundColor: ['rgba(0, 243, 255, 0.8)', 'rgba(255, 42, 109, 0.8)'],
                borderColor: ['#00f3ff', '#ff2a6d'],
                borderWidth: 1,
                hoverOffset: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '70%',
            plugins: {
                legend: { position: 'bottom', labels: { padding: 20, usePointStyle: true } }
            }
        }
    });

    // 2. Bar Chart - Historical Trends across all dates
    // Aggregate total 'Present' counts per date from students data
    const dateCounts = {};
    currentStudents.forEach(student => {
        // Collect local pending changes mapped cleanly over historical attendance
        const mergedAttendance = { ...(student.attendance || {}) };
        if (pendingAttendance[student.id]) {
            mergedAttendance[selectedDate] = pendingAttendance[student.id];
        }

        Object.keys(mergedAttendance).forEach(date => {
            if (!dateCounts[date]) dateCounts[date] = 0;
            if (mergedAttendance[date] === 'Present') {
                dateCounts[date]++;
            }
        });
    });

    const sortedDates = Object.keys(dateCounts).sort();
    const presentData = sortedDates.map(date => dateCounts[date]);

    const barCtx = document.getElementById('bar-chart').getContext('2d');
    if (barChart) barChart.destroy();

    barChart = new Chart(barCtx, {
        type: 'bar',
        data: {
            labels: sortedDates,
            datasets: [{
                label: 'Total Present',
                data: presentData,
                backgroundColor: 'rgba(194, 105, 255, 0.6)',
                borderColor: '#c269ff',
                borderWidth: 1,
                borderRadius: 4,
                barThickness: 'flex',
                maxBarThickness: 40
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    grid: { color: 'rgba(255,255,255,0.05)' },
                    ticks: { precision: 0 }
                },
                x: {
                    grid: { display: false }
                }
            },
            plugins: {
                legend: { display: false }
            }
        }
    });
}

searchStudentInput.addEventListener('input', (e) => {
    renderStudents(e.target.value);
});

// Local cache of attendance instead of auto-save
window.markAttendance = (studentId, status) => {
    pendingAttendance[studentId] = status;
    renderStudents(searchStudentInput.value); // Re-render to update UI immediately
}

document.getElementById('mark-all-present-btn').addEventListener('click', () => {
    if (studentsData.length === 0) return;
    studentsData.forEach(student => {
        pendingAttendance[student.id] = "Present";
    });
    renderStudents(searchStudentInput.value);
});

document.getElementById('delete-attendance-btn').addEventListener('click', async () => {
    if (!currentBatchId) return;
    if (!confirm(`Are you sure you want to delete all attendance records for ${selectedDate}?`)) return;

    showLoader();
    try {
        const batch = db.batch();
        for (const student of studentsData) {
            const studentRef = db.collection('batches').doc(currentBatchId).collection('students').doc(student.id);
            batch.set(studentRef, {
                attendance: {
                    [selectedDate]: firebase.firestore.FieldValue.delete()
                }
            }, { merge: true });

            // Clear local cached states
            if (student.attendance && student.attendance[selectedDate]) {
                delete student.attendance[selectedDate];
            }
            if (pendingAttendance[student.id]) {
                delete pendingAttendance[student.id];
            }
        }
        await batch.commit();

        renderStudents(searchStudentInput.value);
        alert(`Attendance for ${selectedDate} has been deleted.`);

        // =============== EXCEL EXPORT LOGIC ===============
        const exportData = [];
        const allDatesSet = new Set();
        studentsData.forEach(student => {
            if (student.attendance) {
                Object.keys(student.attendance).forEach(date => allDatesSet.add(date));
            }
        });
        const sortedDates = Array.from(allDatesSet).sort();
        studentsData.forEach(student => {
            const rowData = { "Club ID": student.clubId, "Name": student.name };
            sortedDates.forEach(date => {
                rowData[date] = (student.attendance && student.attendance[date]) ? student.attendance[date] : "Not Marked";
            });
            exportData.push(rowData);
        });
        if (exportData.length > 0 && typeof XLSX !== 'undefined') {
            const ws = XLSX.utils.json_to_sheet(exportData);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, "Attendance");
            XLSX.writeFile(wb, `Attendance_${currentBatchName}.xlsx`);
        }
        // ==================================================

    } catch (err) {
        console.error("Error deleting attendance: ", err);
        alert("Failed to delete attendance.");
    }
    hideLoader();
});

// Save attendance on button click
document.getElementById('save-attendance-btn').addEventListener('click', async () => {
    if (Object.keys(pendingAttendance).length === 0) {
        alert("No attendance changes to save.");
        return;
    }
    showLoader();
    try {
        const batch = db.batch();
        for (const [studentId, status] of Object.entries(pendingAttendance)) {
            const studentRef = db.collection('batches').doc(currentBatchId).collection('students').doc(studentId);
            batch.set(studentRef, {
                attendance: {
                    [selectedDate]: status
                }
            }, { merge: true });

            // Update local studentsData to ensure export has the latest changes
            const s = studentsData.find(st => st.id === studentId);
            if (s) {
                if (!s.attendance) s.attendance = {};
                s.attendance[selectedDate] = status;
            }
        }
        await batch.commit();
        pendingAttendance = {}; // Clear pending attendance

        // =============== EXCEL EXPORT LOGIC ===============
        const exportData = [];

        // 1. Extract all unique dates across all students for columns
        const allDatesSet = new Set();
        studentsData.forEach(student => {
            if (student.attendance) {
                Object.keys(student.attendance).forEach(date => allDatesSet.add(date));
            }
        });
        const sortedDates = Array.from(allDatesSet).sort();

        // 2. Build a single row per student
        studentsData.forEach(student => {
            const rowData = {
                "Club ID": student.clubId,
                "Name": student.name
            };

            // Add each date as a column
            sortedDates.forEach(date => {
                // If they have attendance for that date, log it, else 'Not Marked' (or empty depending on preference)
                rowData[date] = (student.attendance && student.attendance[date]) ? student.attendance[date] : "Not Marked";
            });

            exportData.push(rowData);
        });

        // Generate and download Excel file
        if (exportData.length > 0 && typeof XLSX !== 'undefined') {
            const ws = XLSX.utils.json_to_sheet(exportData);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, "Attendance");
            XLSX.writeFile(wb, `Attendance_${currentBatchName}.xlsx`);
        }
        // ==================================================

        alert("Attendance saved and exported to Excel successfully!");
    } catch (error) {
        console.error("Error saving attendance:", error);
        alert("Failed to save attendance.");
    }
    hideLoader();
});

// =============== ADD / EDIT / DELETE STUDENTS ===============
document.getElementById('add-student-btn').addEventListener('click', () => {
    modalTitle.innerText = "Add Student";
    studentForm.reset();
    studentIdInput.value = "";
    studentError.innerText = "";
    studentModal.classList.remove('hidden');
});

document.querySelector('#student-modal .close-btn').addEventListener('click', () => {
    studentModal.classList.add('hidden');
});

window.editStudent = (studentId) => {
    const student = studentsData.find(s => s.id === studentId);
    if (student) {
        modalTitle.innerText = "Edit Student";
        studentIdInput.value = student.id;
        studentNameInput.value = student.name;
        studentClubIdInput.value = student.clubId;
        studentError.innerText = "";
        studentModal.classList.remove('hidden');
    }
};

window.deleteStudent = async (studentId) => {
    if (confirm("Are you sure you want to delete this student?")) {
        showLoader();
        try {
            await db.collection('batches').doc(currentBatchId).collection('students').doc(studentId).delete();
        } catch (error) {
            console.error("Error deleting student:", error);
            alert("Failed to delete student.");
        }
        hideLoader();
    }
};

studentForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = studentIdInput.value;
    const name = studentNameInput.value.trim();
    const clubId = studentClubIdInput.value.trim();

    // EXTRA RULES: Prevent duplicate clubId
    const isDuplicate = studentsData.some(s => s.clubId === clubId && s.id !== id);
    if (isDuplicate) {
        studentError.innerText = "Club ID must be unique!";
        return;
    }

    showLoader();
    studentError.innerText = "";

    try {
        const data = { name, clubId };

        if (id) {
            // Update
            await db.collection('batches').doc(currentBatchId).collection('students').doc(id).update(data);
        } else {
            // Add new with empty attendance object properly setup
            data.attendance = {};
            await db.collection('batches').doc(currentBatchId).collection('students').add(data);
        }
        studentModal.classList.add('hidden');
    } catch (error) {
        console.error("Error saving student:", error);
        studentError.innerText = "Failed to save student: " + error.message;
    }
    hideLoader();
});

// =============== PDF GENERATION (jsPDF) ===============
document.getElementById('download-pdf-btn').addEventListener('click', () => {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    // PDF Title
    doc.setFontSize(18);
    doc.setTextColor(40, 40, 40);
    doc.text("Oyster Attendance Report", 14, 22);

    // Metadata
    doc.setFontSize(11);
    doc.setTextColor(100, 100, 100);
    doc.text(`Date: ${selectedDate}`, 14, 32);
    doc.text(`Batch Name: ${currentBatchName}`, 14, 38);
    doc.text(`Summary -> Present: ${totalPresentEl.innerText} | Absent: ${totalAbsentEl.innerText} | Total: ${totalStudentsEl.innerText}`, 14, 44);

    // Table content building (Sorted student list applies since studentsData is sorted)
    const tableData = [];
    studentsData.forEach(student => {
        let attendance = pendingAttendance[student.id];
        if (attendance === undefined) {
            attendance = student.attendance && student.attendance[selectedDate] ? student.attendance[selectedDate] : "Not Marked";
        }
        tableData.push([
            student.clubId,
            student.name,
            attendance
        ]);
    });

    // AutoTable layout
    doc.autoTable({
        startY: 50,
        head: [['Club ID', 'Name', 'Status']],
        body: tableData,
        theme: 'grid',
        styles: { fontSize: 10 },
        headStyles: { fillColor: [67, 97, 238], textColor: [255, 255, 255] }, // matches --primary CSS
        didParseCell: function (data) {
            // Highlight row based on attendance
            if (data.section === 'body' && data.column.index === 2) {
                if (data.cell.raw === 'Present') {
                    data.cell.styles.textColor = [46, 204, 113]; // success color
                    data.cell.styles.fontStyle = 'bold';
                } else if (data.cell.raw === 'Absent') {
                    data.cell.styles.textColor = [231, 76, 60];  // danger color
                    data.cell.styles.fontStyle = 'bold';
                }
            }
        }
    });

    // Save File
    doc.save(`Attendance_${currentBatchName}_${selectedDate}.pdf`);
});
