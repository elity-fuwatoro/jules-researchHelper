// Main Application Logic
document.addEventListener('DOMContentLoaded', () => {
    console.log('Application Loaded');

    initDB().then(db => {
        console.log('Database is ready.');
        loadMainView();
    }).catch(error => {
        console.error('Failed to initialize database:', error);
        const contentArea = document.getElementById('app-content');
        if (contentArea) {
            contentArea.innerHTML = '<p style="color: red;">データベースの初期化に失敗しました。アプリケーションを続行できません。</p>';
        }
    });

    document.getElementById('nav-main').addEventListener('click', () => loadMainView());
    document.getElementById('nav-settings').addEventListener('click', () => loadSettingsView());
});

const contentArea = document.getElementById('app-content');

async function loadMainView() {
    contentArea.innerHTML = '<h2>部屋一覧</h2><div id="room-grid"></div>';
    const roomGrid = document.getElementById('room-grid');

    let rooms = [];
    const savedRooms = await getSetting('rooms');

    if (savedRooms && savedRooms.length > 0) {
        rooms = savedRooms.split(',').map(r => r.trim()).filter(r => r);
    } else {
        const excludedNumbers = [4, 9, 14, 19, 24];
        for (let i = 1; i <= 33; i++) {
            if (!excludedNumbers.includes(i)) {
                rooms.push(i.toString());
            }
        }
    }

    roomGrid.innerHTML = '';
    for (const roomNumber of rooms) {
        const roomDiv = document.createElement('div');
        roomDiv.className = 'room-box';
        roomDiv.dataset.roomNumber = roomNumber;

        const patient = await getPatientByRoom(roomNumber);
        if (patient) {
            roomDiv.classList.add('occupied');
            roomDiv.innerHTML = `${roomNumber}<span class="patient-name-tag">${patient.name}</span>`;
        } else {
            roomDiv.textContent = roomNumber;
        }

        roomDiv.addEventListener('click', () => {
            loadRoomDetailView(roomNumber);
        });
        roomGrid.appendChild(roomDiv);
    }
}

async function loadSettingsView() {
    contentArea.innerHTML = `
        <h2>設定</h2>
        <div class="settings-section">
            <h3>部屋名・主治医リスト</h3>
            <p>部屋番号をカンマ区切りで入力してください。</p>
            <textarea id="room-settings-textarea" class="settings-textarea" rows="4"></textarea>
            <h4 style="margin-top: 1.5rem;">主治医リストの編集</h4>
            <div id="doctor-list-container"></div>
            <div class="doctor-add-form">
                <input type="text" id="new-doctor-input" placeholder="主治医名">
                <button id="add-doctor-btn">追加</button>
            </div>
            <button id="save-general-settings-btn" class="save-btn">部屋と主治医を保存</button>
        </div>
        <div class="settings-section">
            <h3>研究の管理</h3>
            <div id="research-list-container"></div>
            <div id="add-research-form">
                <h4>新しい研究の追加</h4>
                <input type="text" id="new-research-name" placeholder="研究名" class="settings-input">
                <div id="research-fields-container"></div>
                <button id="add-field-btn" class="secondary-btn">項目を追加</button>
                <button id="save-research-btn" class="save-btn">この研究を保存</button>
            </div>
        </div>
    `;
    const roomsInput = document.getElementById('room-settings-textarea');
    const doctorListContainer = document.getElementById('doctor-list-container');
    let doctors = [];
    async function loadGeneralSettings() {
        const savedRooms = await getSetting('rooms');
        roomsInput.value = savedRooms || '';
        doctors = (await getSetting('doctors')) || [];
        renderDoctorList();
    }
    function renderDoctorList() {
        if (doctors.length === 0) {
            doctorListContainer.innerHTML = '<p>登録されている主治医はいません。</p>';
        } else {
            doctorListContainer.innerHTML = '<ul class="doctor-list">' + doctors.map(doc => `<li><span>${doc}</span> <button class="delete-btn" data-doctor="${doc}">削除</button></li>`).join('') + '</ul>';
        }
    }
    doctorListContainer.addEventListener('click', (event) => {
        if (event.target.classList.contains('delete-btn')) {
            const doctorToDelete = event.target.dataset.doctor;
            doctors = doctors.filter(doc => doc !== doctorToDelete);
            renderDoctorList();
        }
    });
    document.getElementById('add-doctor-btn').addEventListener('click', () => {
        const newDoctorInput = document.getElementById('new-doctor-input');
        const newDoctor = newDoctorInput.value.trim();
        if (newDoctor && !doctors.includes(newDoctor)) {
            doctors.push(newDoctor);
            newDoctorInput.value = '';
            renderDoctorList();
        }
    });
    document.getElementById('save-general-settings-btn').addEventListener('click', async () => {
        try {
            await saveSetting('rooms', roomsInput.value.trim());
            await saveSetting('doctors', doctors);
            alert('部屋と主治医の情報を保存しました。');
            loadMainView();
        } catch (error) {
            console.error('Failed to save settings:', error);
            alert('設定の保存中にエラーが発生しました。');
        }
    });
    const researchListContainer = document.getElementById('research-list-container');
    const fieldsContainer = document.getElementById('research-fields-container');
    let fieldCounter = 0;
    async function loadResearchData() {
        const researches = await getAllResearches();
        renderResearchList(researches);
    }
    function renderResearchList(researches) {
        if (!researches || researches.length === 0) {
            researchListContainer.innerHTML = '<p>登録されている研究はありません。</p>';
        } else {
            researchListContainer.innerHTML = '<h4>既存の研究</h4><ul class="research-list">' + researches.map(r => `<li><span>${r.researchName} (ID: ${r.researchId})</span><button class="delete-btn" data-research-id="${r.researchId}">削除</button></li>`).join('') + '</ul>';
        }
    }
    researchListContainer.addEventListener('click', async (event) => {
        if (event.target.classList.contains('delete-btn')) {
            const researchId = parseInt(event.target.dataset.researchId, 10);
            if (confirm('この研究を削除しますか？関連するデータは削除されません。')) {
                await deleteResearch(researchId);
                loadResearchData();
            }
        }
    });
    document.getElementById('add-field-btn').addEventListener('click', () => {
        fieldCounter++;
        const fieldHtml = `<div class="research-field-row" id="field-row-${fieldCounter}"><input type="text" placeholder="項目名" class="field-name"><select class="field-type"><option value="text">テキスト</option><option value="number">数値</option><option value="date">日付</option><option value="select">選択式</option></select><input type="text" placeholder="選択肢 (カンマ区切り)" class="field-options" style="display:none;"><button class="remove-field-btn" data-row-id="${fieldCounter}">×</button></div>`;
        fieldsContainer.insertAdjacentHTML('beforeend', fieldHtml);
    });
    fieldsContainer.addEventListener('change', (event) => {
        if (event.target.classList.contains('field-type')) {
            const optionsInput = event.target.nextElementSibling;
            optionsInput.style.display = event.target.value === 'select' ? 'inline-block' : 'none';
        }
    });
    fieldsContainer.addEventListener('click', (event) => {
        if (event.target.classList.contains('remove-field-btn')) {
            const rowId = event.target.dataset.rowId;
            document.getElementById(`field-row-${rowId}`).remove();
        }
    });
    document.getElementById('save-research-btn').addEventListener('click', async () => {
        const researchName = document.getElementById('new-research-name').value.trim();
        if (!researchName) {
            alert('研究名を入力してください。');
            return;
        }
        const fields = [];
        const fieldRows = fieldsContainer.querySelectorAll('.research-field-row');
        for (const row of fieldRows) {
            const name = row.querySelector('.field-name').value.trim();
            const type = row.querySelector('.field-type').value;
            const options = row.querySelector('.field-options').value.trim();
            if (name) {
                const field = { name, type };
                if (type === 'select' && options) {
                    field.options = options.split(',').map(o => o.trim());
                }
                fields.push(field);
            }
        }
        if (fields.length === 0) {
            alert('少なくとも1つの項目を定義してください。');
            return;
        }
        await addResearch({ researchName, fields });
        alert('研究を保存しました。');
        document.getElementById('new-research-name').value = '';
        fieldsContainer.innerHTML = '';
        fieldCounter = 0;
        loadResearchData();
    });
    loadGeneralSettings();
    loadResearchData();
}

async function loadRoomDetailView(roomNumber) {
    const patient = await getPatientByRoom(roomNumber);

    if (patient) {
        contentArea.innerHTML = `
            <h2>部屋 ${roomNumber} - 患者情報</h2>
            <div class="patient-info-card">
                <p><strong>患者ID:</strong> ${patient.patientId}</p>
                <p><strong>氏名:</strong> ${patient.name}</p>
                <p><strong>年齢:</strong> ${patient.age}</p>
                <p><strong>性別:</strong> ${patient.sex}</p>
                <p><strong>主治医:</strong> ${patient.doctor}</p>
                <p><strong>入院日:</strong> ${patient.admissionDate}</p>
            </div>
            <button id="discharge-btn" class="delete-btn">退床させる</button>
            <div id="patient-research-area" class="settings-section">
                <h3>研究データ入力</h3>
                <div id="research-selection-list"></div>
                <hr>
                <div id="research-form-container"></div>
            </div>
        `;

        const researchSelectionList = document.getElementById('research-selection-list');
        const allResearches = await getAllResearches();

        if (allResearches && allResearches.length > 0) {
            allResearches.forEach(research => {
                const researchButton = document.createElement('button');
                researchButton.className = 'secondary-btn research-select-btn';
                researchButton.textContent = research.researchName;
                researchButton.addEventListener('click', () => {
                    renderResearchForm(patient, research);
                });
                researchSelectionList.appendChild(researchButton);
            });
        } else {
            researchSelectionList.innerHTML = '<p>利用可能な研究はありません。</p>';
        }

        document.getElementById('discharge-btn').addEventListener('click', async () => {
            if (confirm(`${patient.name}さんを退床させますか？`)) {
                try {
                    await dischargePatient(patient.patientId);
                    alert('退床処理が完了しました。');
                    loadRoomDetailView(roomNumber);
                } catch (error) {
                    console.error('Discharge failed:', error);
                    alert('退床処理中にエラーが発生しました。');
                }
            }
        });

    } else {
        const doctors = await getSetting('doctors') || [];
        const doctorOptions = doctors.map(d => `<option value="${d}">${d}</option>`).join('');

        contentArea.innerHTML = `
            <h2>部屋 ${roomNumber} - 新規入床</h2>
            <form id="admission-form" class="form-card">
                <label for="patientId">患者ID</label>
                <input type="text" id="patientId" required>
                <label for="name">氏名</label>
                <input type="text" id="name" required>
                <label for="age">年齢</label>
                <input type="number" id="age" required>
                <label for="sex">性別</label>
                <select id="sex" required><option value="男性">男性</option><option value="女性">女性</option></select>
                <label for="doctor">主治医</label>
                <select id="doctor" required>${doctorOptions}</select>
                <label for="admissionDate">入院日</label>
                <input type="date" id="admissionDate" required>
                <button type="submit" class="save-btn">入床させる</button>
            </form>
        `;

        document.getElementById('admissionDate').value = new Date().toISOString().split('T')[0];

        document.getElementById('admission-form').addEventListener('submit', async (event) => {
            event.preventDefault();
            if (!confirm('この情報で入床させますか？')) return;

            const patientData = {
                patientId: document.getElementById('patientId').value.trim(),
                name: document.getElementById('name').value.trim(),
                age: document.getElementById('age').value,
                sex: document.getElementById('sex').value,
                doctor: document.getElementById('doctor').value,
                admissionDate: document.getElementById('admissionDate').value,
                roomNumber: roomNumber
            };

            if (!patientData.patientId || !patientData.name || !patientData.age) {
                alert('患者ID, 氏名, 年齢は必須です。');
                return;
            }

            try {
                const existingPatient = await getCurrentPatientById(patientData.patientId);
                if (existingPatient) {
                    if (confirm(`患者ID ${patientData.patientId} は既に部屋 ${existingPatient.roomNumber} に入床しています。この部屋に移動させますか？`)) {
                        const updatedData = { ...existingPatient, ...patientData };
                        await updatePatient(updatedData);
                        alert('患者を移動しました。');
                        loadRoomDetailView(roomNumber);
                        loadMainView();
                    }
                } else {
                    await addPatient(patientData);
                    alert('患者を入床させました。');
                    loadRoomDetailView(roomNumber);
                }
            } catch (error) {
                console.error('Admission failed:', error);
                alert(`入床処理中にエラーが発生しました: ${error.message}`);
            }
        });
    }
}

async function renderResearchForm(patient, research) {
    const container = document.getElementById('research-form-container');
    container.innerHTML = `<h4>${research.researchName} - データ入力</h4>`;

    const existingData = await getResearchData(patient.patientId, research.researchId);
    const data = existingData ? existingData.data : {};

    const form = document.createElement('form');
    form.id = 'dynamic-research-form';

    research.fields.forEach(field => {
        const fieldWrapper = document.createElement('div');
        fieldWrapper.className = 'form-field';

        const label = document.createElement('label');
        label.textContent = field.name;
        fieldWrapper.appendChild(label);

        let input;
        switch (field.type) {
            case 'select':
                input = document.createElement('select');
                // Add a blank default option
                const defaultOption = document.createElement('option');
                defaultOption.value = '';
                defaultOption.textContent = '選択してください';
                input.appendChild(defaultOption);

                field.options.forEach(opt => {
                    const option = document.createElement('option');
                    option.value = opt;
                    option.textContent = opt;
                    if (data[field.name] === opt) {
                        option.selected = true;
                    }
                    input.appendChild(option);
                });
                break;
            case 'date':
                input = document.createElement('input');
                input.type = 'date';
                input.value = data[field.name] || '';
                break;
            case 'number':
                input = document.createElement('input');
                input.type = 'number';
                input.value = data[field.name] || '';
                break;
            case 'text':
            default:
                input = document.createElement('input');
                input.type = 'text';
                input.value = data[field.name] || '';
                break;
        }
        input.dataset.fieldName = field.name;
        fieldWrapper.appendChild(input);
        form.appendChild(fieldWrapper);
    });

    const saveButton = document.createElement('button');
    saveButton.type = 'submit';
    saveButton.className = 'save-btn';
    saveButton.textContent = 'この研究データを保存';
    form.appendChild(saveButton);

    form.addEventListener('submit', async (event) => {
        event.preventDefault();

        const collectedData = {};
        const inputs = form.querySelectorAll('[data-field-name]');
        inputs.forEach(input => {
            collectedData[input.dataset.fieldName] = input.value;
        });

        const dataToSave = {
            patientId: patient.patientId,
            researchId: research.researchId,
            data: collectedData
        };

        // If we are updating, we must include the primary key (dataId) for the 'put' operation
        if (existingData && existingData.dataId) {
            dataToSave.dataId = existingData.dataId;
        }

        try {
            await saveResearchData(dataToSave);
            alert('研究データを保存しました。');
            // Re-render form to confirm data is saved and loaded correctly
            renderResearchForm(patient, research);
        } catch (error) {
            console.error('Failed to save research data:', error);
            alert('研究データの保存中にエラーが発生しました。');
        }
    });

    container.appendChild(form);
}
