document.addEventListener('DOMContentLoaded', () => {
    const API_BASE = '';
    /* =========================================================================
       DATOS INICIALES Y CONFIGURACIÓN (Hardcoded)
       ========================================================================= */
    const CONFIG_ROOMS = [
        // Piso 1
        { id: '101', floor: 1, price: 550, type: 'Habitación' },
        { id: '102', floor: 1, price: 560, type: 'Habitación', note: 'Fija - Conserje' },
        { id: '103', floor: 1, price: 570, type: 'Habitación' },
        { id: '104', floor: 1, price: 570, type: 'Habitación' },
        { id: '105', floor: 1, price: 570, type: 'Habitación' },
        // Piso 2
        { id: '201', floor: 2, price: 610, type: 'Habitación' },
        { id: '202', floor: 2, price: 620, type: 'Habitación' },
        { id: '203', floor: 2, price: 650, type: 'Habitación' },
        { id: '204', floor: 2, price: 610, type: 'Habitación' },
        // Piso 3
        { id: '301', floor: 3, price: 500, type: 'Habitación' },
        { id: '302', floor: 3, price: 500, type: 'Habitación' },
        { id: '303', floor: 3, price: 570, type: 'Habitación' },
        { id: '304', floor: 3, price: 560, type: 'Habitación' },
        { id: '305', floor: 3, price: 580, type: 'Habitación' },
        { id: '306', floor: 3, price: 610, type: 'Habitación' },
        // Cochera
        { id: 'C1', floor: 'Cochera', price: 220, type: 'Cochera' }
    ];

    const MOCK_APPLICANTS = [
        { id: 'A001', date: '2026-03-01', name: 'Dr. Carlos Merino', dni: '45678912', phone: '987654321', profession: 'Residente R1 - Cirugía', address: 'Av. Arequipa 123' },
        { id: 'A002', date: '2026-03-02', name: 'Dra. Luisa Fernanda', dni: '72345678', phone: '998877665', profession: 'Serumista', address: 'Calle Los Cedros 45' },
        { id: 'A003', date: '2026-03-02', name: 'Tec. Martin Gomez', dni: '09876543', phone: '912345678', profession: 'Tec. Enfermería', address: 'Mz H Lote 3, Callao' }
    ];

    const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

    /* =========================================================================
       ESTADO DE LA APLICACIÓN (Persistencia en localStorage)
       ========================================================================= */
    let state = {
        activeTenants: [],
        archivedTenants: [],
        applicants: [...MOCK_APPLICANTS], // Simulamos que trae de Google Sheets al iniciar
        showHistoryInMatrix: false,
        roomPrices: {} // Almacenar precios actualizados
    };

    // Convierte YYYY-MM-DD a DD/MM/YYYY HH:MM:SS; deja intacto lo que ya esté en ese formato
    function normalizarFecha(str) {
        if (!str) return str;
        const iso = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (iso) return `${iso[3]}/${iso[2]}/${iso[1]} 00:00:00`;
        return str;
    }

    function loadStateFromLocalStorage() {
        try {
            const savedState = localStorage.getItem('hospedajeState');
            if (savedState) {
                try {
                    const parsed = JSON.parse(savedState);
                    state.activeTenants = (parsed.activeTenants || []).map(t => ({ ...t, name: (t.name || '').toUpperCase() }));
                    state.archivedTenants = (parsed.archivedTenants || []).map(t => ({ ...t, name: (t.name || '').toUpperCase() }));
                    state.applicants = (parsed.applicants || []).map(a => ({ ...a, name: (a.name || '').toUpperCase(), date: normalizarFecha(a.date) }));
                    state.roomPrices = parsed.roomPrices || {}; 
                } catch (e) {
                    console.error("Error parseando localStorage:", e);
                    iniciarStatePorDefecto();
                }
            } else {
                iniciarStatePorDefecto();
            }
        } catch (storageErr) {
            console.warn('localStorage bloqueado por el navegador, cargando datos por defecto:', storageErr);
            iniciarStatePorDefecto();
        }
    }

    function hydrateStateFromPayload(payload) {
        if (!payload || typeof payload !== 'object') return;

        state.activeTenants = (payload.activeTenants || []).map(t => ({ ...t, name: (t.name || '').toUpperCase() }));
        state.archivedTenants = (payload.archivedTenants || []).map(t => ({ ...t, name: (t.name || '').toUpperCase() }));
        state.applicants = (payload.applicants || []).map(a => ({ ...a, name: (a.name || '').toUpperCase(), date: normalizarFecha(a.date) }));
        state.roomPrices = payload.roomPrices || {};
    }

    async function loadStateFromServer() {
        try {
            const response = await fetch(`${API_BASE}/api/state`, {
                method: 'GET',
                cache: 'no-store'
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const serverState = await response.json();
            const hasServerData =
                (serverState.activeTenants && serverState.activeTenants.length > 0) ||
                (serverState.archivedTenants && serverState.archivedTenants.length > 0) ||
                (serverState.applicants && serverState.applicants.length > 0) ||
                (serverState.roomPrices && Object.keys(serverState.roomPrices).length > 0);

            if (hasServerData) {
                hydrateStateFromPayload(serverState);
                try {
                    localStorage.setItem('hospedajeState', JSON.stringify(state));
                } catch (error) {
                    console.warn('No se pudo actualizar localStorage desde servidor:', error);
                }
            }
        } catch (error) {
            console.warn('No se pudo cargar estado desde Node API, se usará almacenamiento local:', error);
        }
    }

    function iniciarStatePorDefecto() {
        // Data inicial vacía o default
        state.activeTenants = [
            {
                id: 'T001', roomId: '102', name: 'Fredy Sanchez', dni: '12345678', phone: '999999999', address: '-',
                checkIn: '2025-01-01', 
                payments: { 'ene': true, 'feb': true, 'mar': false }
            }
        ];
        state.archivedTenants = [];
        state.applicants = [...MOCK_APPLICANTS];
        state.roomPrices = {};
        // NO llamamos saveState() aquí para no sobreescribir la nube con datos por defecto
    }

    async function saveStateToServer() {
        try {
            const response = await fetch(`${API_BASE}/api/state`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    activeTenants: state.activeTenants || [],
                    archivedTenants: state.archivedTenants || [],
                    applicants: state.applicants || [],
                    roomPrices: state.roomPrices || {}
                })
            });

            let payload = null;
            try {
                payload = await response.json();
            } catch (_parseError) {
                payload = null;
            }

            if (!response.ok) {
                const detail = payload && payload.error ? `: ${payload.error}` : '';
                throw new Error(`HTTP ${response.status}${detail}`);
            }

            return true;
        } catch (error) {
            console.warn('No se pudo persistir en Node API:', error);
            mostrarMensaje(`No se pudo guardar en servidor (${error.message}).`, 'error');
            return false;
        }
    }

    function saveState() {
        try {
            localStorage.setItem('hospedajeState', JSON.stringify(state));
        } catch (storageErr) {
            console.warn('localStorage bloqueado, los datos se guardarán solo en servidor:', storageErr);
        }
        saveStateToServer();
    }

    /* =========================================================================
       NAVEGACIÓN / SPA LOGIC
       ========================================================================= */
    const navButtons = document.querySelectorAll('.nav-btn');
    const viewSections = document.querySelectorAll('.view-section');
    const viewTitle = document.getElementById('current-view-title');

    navButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const viewId = btn.getAttribute('data-view');
            // Update active button
            navButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            // Update Title
            viewTitle.innerText = btn.innerText.trim();

            // Show corresponding section
            viewSections.forEach(sec => {
                if(sec.id === viewId) {
                    sec.classList.remove('hidden');
                } else {
                    sec.classList.add('hidden');
                }
            });

            // Trigger re-renders if necessary based on view
            if(viewId === 'matrix-view') renderMatrix();
            if(viewId === 'rooms-view') renderRoomsDashboard();
            if(viewId === 'applicants-view') {
                cargarPostulantesSiNoHayLocales();
            }
            if(viewId === 'prices-view') renderPrices();
            if(viewId === 'history-view') renderHistory();
        });
    });

    /* =========================================================================
       RENDER: MATRIZ PRINCIPAL
       ========================================================================= */
    const matrixTbody = document.getElementById('matrix-tbody');
    const matrixTfoot = document.getElementById('matrix-tfoot');
    const toggleHistoryBtn = document.getElementById('toggle-history');

    toggleHistoryBtn.addEventListener('change', (e) => {
        state.showHistoryInMatrix = e.target.checked;
        renderMatrix();
    });

    function renderMatrix() {
        matrixTbody.innerHTML = '';
        
        let displayTenants = [...state.activeTenants];
        
        if (state.showHistoryInMatrix) {
            const historyCopy = state.archivedTenants.map(t => ({...t, isArchived: true}));
            displayTenants = [...displayTenants, ...historyCopy];
        }

        // Ordenar por habitación
        displayTenants.sort((a, b) => {
            if (a.roomId === b.roomId) {
                // Si es la misma habitación, poner el activo primero y los inactivos (historial) después
                if (!a.isArchived && b.isArchived) return -1;
                if (a.isArchived && !b.isArchived) return 1;
                return 0;
            }
            return a.roomId.localeCompare(b.roomId);
        });

        const totals = { price: 0 };
        MONTHS.forEach(m => totals[m] = 0);

        displayTenants.forEach(tenant => {
            const roomInfo = CONFIG_ROOMS.find(r => r.id === tenant.roomId);
            const price = getRoomPrice(tenant.roomId);
            
            const tr = document.createElement('tr');
            if (tenant.isArchived) {
                tr.classList.add('tenant-archived');
            } else {
                totals.price += price; // Solo sumamos el precio base de los activos a la columna precio (opcional)
            }

            let html = `
                <td data-label="N° Hab"><b>${tenant.roomId}</b></td>
                <td class="col-name" data-label="Nombre Completo">
                    ${!tenant.isArchived 
                        ? `<span class="tenant-name-link" data-id="${tenant.id}">${tenant.name}</span>` 
                        : `<span>${tenant.name} (Retirado)</span>`
                    }
                </td>
                <td data-label="Precio">S/. ${price.toFixed(2)}</td>
            `;

            MONTHS.forEach(month => {
                const isPaid = tenant.payments && tenant.payments[month];
                if (isPaid && !tenant.isArchived) {
                    totals[month] += price;
                }
                
                html += `
                    <td class="month-cell ${isPaid ? 'paid' : ''}" data-month="${month}" data-label="${month.toUpperCase()}">
                        <input type="checkbox" class="check-paid" 
                            data-tenant-id="${tenant.id}" 
                            data-month="${month}" 
                            ${isPaid ? 'checked' : ''} 
                            ${tenant.isArchived ? 'disabled' : ''}>
                    </td>
                `;
            });

            tr.innerHTML = html;
            matrixTbody.appendChild(tr);
        });

        // Totales Foot
        let footerHtml = `<tr>
            <td colspan="2" style="text-align:right" data-label="Sección"><b>RECAUDACIÓN TOTAL MENSUAL:</b></td>
            <td data-label="Potencial"><b>S/. ${totals.price.toFixed(2)}</b></td>
        `;
        MONTHS.forEach(m => {
            footerHtml += `<td data-label="${m.toUpperCase()}"><b>S/. ${totals[m].toFixed(2)}</b></td>`;
        });
        footerHtml += `</tr>`;
        matrixTfoot.innerHTML = footerHtml;

        // Listeners for checkboxes
        document.querySelectorAll('.check-paid').forEach(chk => {
            chk.addEventListener('change', handlePaymentToggle);
        });

        // Listeners for Modal Tenant Ficha
        document.querySelectorAll('.tenant-name-link').forEach(link => {
            link.addEventListener('click', (e) => {
                openTenantModal(e.target.getAttribute('data-id'));
            });
        });
    }

    let mobilePendingChanges = [];
    const mobileSaveFab = document.getElementById('mobile-save-fab');
    const fabChangesCount = document.getElementById('fab-changes-count');
    const confirmSaveModal = document.getElementById('confirm-save-modal');
    const pendingChangesList = document.getElementById('pending-changes-list');
    const mobileConfirmSaveBtn = document.getElementById('mobile-confirm-save-btn');

    function updateMobileFab() {
        if (mobileSaveFab) {
            if (mobilePendingChanges.length > 0) {
                fabChangesCount.innerText = mobilePendingChanges.length;
                mobileSaveFab.classList.remove('hidden');
            } else {
                mobileSaveFab.classList.add('hidden');
            }
        }
    }

    if (mobileSaveFab) {
        mobileSaveFab.addEventListener('click', () => {
            pendingChangesList.innerHTML = '';
            mobilePendingChanges.forEach(change => {
                const li = document.createElement('li');
                li.innerText = change;
                li.style.marginBottom = '6px';
                pendingChangesList.appendChild(li);
            });
            confirmSaveModal.classList.add('show');
        });
    }

    if (mobileConfirmSaveBtn) {
        mobileConfirmSaveBtn.addEventListener('click', () => {
            saveState(); // Sincroniza y guarda local
            mobilePendingChanges = [];
            updateMobileFab();
            confirmSaveModal.classList.remove('show');
        });
    }

    function handlePaymentToggle(e) {
        const tenantId = e.target.getAttribute('data-tenant-id');
        const month = e.target.getAttribute('data-month');
        const isChecked = e.target.checked;

        const tenant = state.activeTenants.find(t => t.id === tenantId);
        if (tenant) {
            if (!tenant.payments) tenant.payments = {};
            tenant.payments[month] = isChecked;
            
            // Solo celular: cambios pendientes hasta dar Grabar explicitamente
            if (window.innerWidth <= 768) {
                const action = isChecked ? 'Pago agregado:' : 'Pago quitado:';
                const desc = `${action} ${month.toUpperCase()} - ${tenant.name} (Hab. ${tenant.roomId})`;
                mobilePendingChanges.push(desc);
                updateMobileFab();
            } else {
                saveState();
            }
            
            renderMatrix(); // Re-render for totals and colors
        }
    }

    /* =========================================================================
       RENDER: DASHBOARD HABITACIONES
       ========================================================================= */
    const grids = {
        1: document.getElementById('floor1-grid'),
        2: document.getElementById('floor2-grid'),
        3: document.getElementById('floor3-grid'),
        'Cochera': document.getElementById('garage-grid')
    };

    function renderRoomsDashboard() {
        Object.values(grids).forEach(g => g.innerHTML = '');

        CONFIG_ROOMS.forEach(room => {
            const occupant = state.activeTenants.find(t => t.roomId === room.id);
            const isFree = !occupant;

            const card = document.createElement('div');
            card.className = 'room-card';
            
            let statusHtml = isFree 
                ? '<span class="room-status status-free">Libre</span>' 
                : '<span class="room-status status-occupied">Ocupada</span>';

            card.innerHTML = `
                ${statusHtml}
                <div class="room-number">${room.id}</div>
                <div class="room-price">S/. ${getRoomPrice(room.id).toFixed(2)}</div>
                ${occupant ? `<div style="font-size:13px; font-weight:600; text-align:center;">${occupant.name}</div>` : ''}
            `;

            // If free, allow quick assign (manual)
            // if (isFree) {
            //     const btn = document.createElement('button');
            //     btn.className = 'room-btn';
            //     btn.innerText = '+ Nuevo Inquilino';
            //     btn.onclick = () => alert('Abre modal para crear inquilino manual aquí');
            //     card.appendChild(btn);
            // }

            grids[room.floor].appendChild(card);
        });
    }

    /* =========================================================================
       RENDER: POSTULANTES (Aspirantes)
       ========================================================================= */
    const applicantsTbody = document.getElementById('applicants-tbody');

    const applicantsSearch = document.getElementById('applicants-search');
    if (applicantsSearch) {
        applicantsSearch.addEventListener('input', renderApplicants);
    }

    function renderApplicants() {
        applicantsTbody.innerHTML = '';
        if (state.applicants.length === 0) {
            applicantsTbody.innerHTML = '<tr><td colspan="5" style="text-align:center">No hay postulantes pendientes.</td></tr>';
            return;
        }

        const filtro = (document.getElementById('applicants-search')?.value || '').toLowerCase().trim();

        // Parsea fechas en formato ISO (2025-03-14) o español de Sheets (14/03/2025 10:30:00)
        function parseFecha(str) {
            if (!str) return 0;
            // Formato DD/MM/YYYY HH:MM:SS o DD/MM/YYYY
            const m = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?: (\d{2}):(\d{2}):(\d{2}))?/);
            if (m) return new Date(+m[3], +m[2]-1, +m[1], +(m[4]||0), +(m[5]||0), +(m[6]||0)).getTime();
            // Formato ISO o cualquier otro reconocible por el navegador
            const t = new Date(str).getTime();
            return isNaN(t) ? 0 : t;
        }

        // Orden: más reciente primero por fecha de postulación
        const lista = [...state.applicants].sort((a, b) => parseFecha(b.date) - parseFecha(a.date));

        const filtrados = filtro
            ? lista.filter(a =>
                (a.name || '').toLowerCase().includes(filtro) ||
                (a.dni || '').toLowerCase().includes(filtro) ||
                (a.phone || '').toLowerCase().includes(filtro)
              )
            : lista;

        if (filtrados.length === 0) {
            applicantsTbody.innerHTML = '<tr><td colspan="5" style="text-align:center">No se encontraron resultados.</td></tr>';
            return;
        }

        filtrados.forEach(app => {
            const tr = document.createElement('tr');
            const estado = (app.ingresoSalida || '').toUpperCase();

            if (app.ingresado || estado === 'INQUILINO') {
                tr.classList.add('applicant-ingresado'); // verde
            } else if (estado === 'RETIRADO') {
                tr.classList.add('applicant-retirado'); // rojo
            }

            let accionHtml;
            if (app.ingresado || estado === 'INQUILINO') {
                accionHtml = '<span style="color:green;font-weight:bold;"><i class="fa-solid fa-house-user"></i> Inquilino</span>';
            } else if (estado === 'RETIRADO') {
                accionHtml = `
                    <span style="color:#c0392b;font-weight:bold;margin-right:8px;">
                        <i class="fa-solid fa-right-from-bracket"></i> Retirado
                    </span>
                    <button class="btn btn-primary btn-process" data-id="${app.id}" style="font-size:0.8em;padding:4px 8px;">
                        <i class="fa-solid fa-rotate-left"></i> Volver a ingresar
                    </button>`;
            } else {
                accionHtml = `<button class="btn btn-primary btn-process" data-id="${app.id}">
                    <i class="fa-solid fa-bed"></i> Procesar Ingreso
                </button>`;
            }

            tr.innerHTML = `
                <td data-label="Fecha Postulación">${app.date}</td>
                <td data-label="Nombre Completo"><b>${app.name}</b></td>
                <td data-label="DNI">${app.dni}</td>
                <td data-label="Celular">${app.phone}</td>
                <td data-label="Acciones">${accionHtml}</td>
            `;
            applicantsTbody.appendChild(tr);
        });

        document.querySelectorAll('.btn-process').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = e.target.closest('.btn-process').getAttribute('data-id');
                openAssignRoomModal(id);
            });
        });
    }

    /* =========================================================================
       MODAL: ASIGNAR HABITACIÓN
       ========================================================================= */
    const assignModal = document.getElementById('assign-room-modal');
    const assignForm = document.getElementById('assign-room-form');
    let currentApplicantId = null;

    function openAssignRoomModal(applicantId) {
        currentApplicantId = applicantId;
        const applicant = state.applicants.find(a => a.id === applicantId);
        
        document.getElementById('assign-tenant-name').innerText = applicant.name;
        document.getElementById('checkin-date').valueAsDate = new Date(); // Hoy

        // Rellenar select de habitaciones libres
        const select = document.getElementById('available-rooms-select');
        select.innerHTML = '';
        
        const occupiedRoomIds = state.activeTenants.map(t => t.roomId);
        const freeRooms = CONFIG_ROOMS.filter(r => !occupiedRoomIds.includes(r.id));

        if (freeRooms.length === 0) {
            select.innerHTML = '<option value="">-- No hay habitaciones libres --</option>';
            document.querySelector('#assign-room-form button').disabled = true;
        } else {
            document.querySelector('#assign-room-form button').disabled = false;
            freeRooms.forEach(r => {
                const opt = document.createElement('option');
                opt.value = r.id;
                opt.text = `Habitación ${r.id} - S/.${getRoomPrice(r.id)} (${r.floor === 'Cochera' ? 'Cochera' : `Piso ${r.floor}`})`;
                select.appendChild(opt);
            });
        }

        assignModal.classList.add('show');
    }

    assignForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const roomId = document.getElementById('available-rooms-select').value;
        const checkIn = document.getElementById('checkin-date').value;

        if (!roomId) return;

        const applicantIndex = state.applicants.findIndex(a => a.id === currentApplicantId);
        const applicant = state.applicants[applicantIndex];

        // Marcar como ingresado
        if (applicant) {
            applicant.ingresado = true;
            applicant.ingresoSalida = 'INQUILINO';
            state.applicants[applicantIndex] = applicant;
        }

        // Crear nuevo inquilino activo (generando ID único simple)
        const newTenant = {
            id: 'T' + Date.now(),
            roomId: roomId,
            name: applicant.name.toUpperCase(),
            dni: applicant.dni,
            phone: applicant.phone,
            address: applicant.address || '-',
            checkIn: checkIn,
            payments: {} // empty payments
        };
        state.activeTenants.push(newTenant);

        saveState();
        closeModals();
        renderApplicants();
        renderMatrix();
        renderRoomsDashboard();
        
        // Simular clic en menú para verlo reflejado (opcional, o alert)
        // document.querySelector('[data-view="matrix-view"]').click();
    });

    /* =========================================================================
       MODAL: AGREGAR POSTULANTE MANUAL
       ========================================================================= */
    const addApplicantModal = document.getElementById('add-applicant-modal');
    const addApplicantForm = document.getElementById('add-applicant-form');
    const addApplicantBtn = document.getElementById('add-applicant-btn');

    addApplicantBtn.addEventListener('click', () => {
        // Establecer fecha de hoy como valor por defecto
        const today = new Date().toISOString().split('T')[0];
        document.getElementById('new-applicant-date').value = today;
        document.getElementById('new-applicant-name').value = '';
        document.getElementById('new-applicant-dni').value = '';
        document.getElementById('new-applicant-phone').value = '';
        document.getElementById('new-applicant-profession').value = '';
        document.getElementById('new-applicant-address').value = '';
        addApplicantModal.classList.add('show');
    });

    addApplicantForm.addEventListener('submit', (e) => {
        e.preventDefault();
        
        const date = document.getElementById('new-applicant-date').value;
        const name = document.getElementById('new-applicant-name').value.trim();
        const dni = document.getElementById('new-applicant-dni').value.trim();
        const phone = document.getElementById('new-applicant-phone').value.trim();
        const profession = document.getElementById('new-applicant-profession').value.trim();
        const address = document.getElementById('new-applicant-address').value.trim();

        if (!date || !name || !dni || !phone) {
            alert('Por favor completa todos los campos requeridos.');
            return;
        }

        // Convertir fecha YYYY-MM-DD al formato DD/MM/YYYY HH:MM:SS (igual que Google Sheets)
        const [y, mo, d] = date.split('-');
        const ahora = new Date();
        const hh = String(ahora.getHours()).padStart(2,'0');
        const mm = String(ahora.getMinutes()).padStart(2,'0');
        const ss = String(ahora.getSeconds()).padStart(2,'0');
        const fechaFormateada = `${d}/${mo}/${y} ${hh}:${mm}:${ss}`;

        // Crear nuevo postulante con ID único
        const newApplicant = {
            id: 'A' + Date.now(),
            date: fechaFormateada,
            name: name.toUpperCase(),
            dni: dni,
            phone: phone,
            profession: profession,
            address: address,
            ingresado: false,
            ingresoSalida: ''
        };

        state.applicants.push(newApplicant);
        saveState();
        closeModals();
        renderApplicants();
        
        // Mostrar mensaje de éxito (opcional)
        setTimeout(() => {
            alert(`Postulante "${name}" agregado exitosamente.`);
        }, 300);
    });

    /* =========================================================================
       MODAL: FICHA INQUILINO Y RETIRO
       ========================================================================= */
    const tenantModal = document.getElementById('tenant-modal');
    const checkoutForm = document.getElementById('checkout-form');
    let currentTenantRetiringId = null;

    function openTenantModal(tenantId) {
        const tenant = state.activeTenants.find(t => t.id === tenantId);
        if(!tenant) return;
        
        currentTenantRetiringId = tenantId;

        document.getElementById('modal-room-badge').innerText = `Hab. ${tenant.roomId}`;
        document.getElementById('modal-tenant-name').innerText = tenant.name;
        document.getElementById('modal-tenant-dni').innerText = tenant.dni;
        document.getElementById('modal-tenant-phone').innerText = tenant.phone;
        document.getElementById('modal-tenant-address').innerText = tenant.address;
        
        document.getElementById('checkout-date').valueAsDate = new Date();
        document.getElementById('checkout-notes').value = '';

        tenantModal.classList.add('show');
    }

    checkoutForm.addEventListener('submit', (e) => {
        e.preventDefault();
        
        // En vez de window.confirm, mostrar el modal nuevo rojo
        document.getElementById('confirm-checkout-modal').classList.add('show');
    });

    document.getElementById('btn-confirm-checkout').addEventListener('click', () => {
        const notes = document.getElementById('checkout-notes').value;
        const checkOutDate = document.getElementById('checkout-date').value;

        const tenantIndex = state.activeTenants.findIndex(t => t.id === currentTenantRetiringId);
        if (tenantIndex > -1) {
            const tenant = state.activeTenants[tenantIndex];
            
            // Mover a archivados
            tenant.checkOut = checkOutDate;
            tenant.notes = notes;

            // Actualizar ingresoSalida en state.applicants localmente
            const appIdx = state.applicants.findIndex(a => a.dni === tenant.dni);
            if (appIdx > -1) {
                state.applicants[appIdx].ingresoSalida = 'RETIRADO';
                state.applicants[appIdx].ingresado = false;
            }

            state.archivedTenants.push(tenant);
            state.activeTenants.splice(tenantIndex, 1);

            saveState();
            closeModals(); // Cerraría tanto el de confirmación como el de la ficha principal
            renderMatrix();
        }
    });

    /* =========================================================================
       MODALES (Lógica Genérica UI)
       ========================================================================= */
    function closeModals() {
        document.querySelectorAll('.modal').forEach(m => m.classList.remove('show'));
    }

    // Cerrar modales con delegación de eventos (más robusto)
    document.addEventListener('click', (e) => {
        if (e.target.closest('.close-modal') || e.target.closest('.close-btn-action')) {
            closeModals();
        }
    });

    // Cerrar clickeando fuera del modal content
    window.addEventListener('click', (e) => {
        if (e.target.classList.contains('modal')) {
            closeModals();
        }
    });

    /* =========================================================================
       RENDER: HISTORIAL (Archivados)
       ========================================================================= */
    const historyTbody = document.getElementById('history-tbody');
    const searchHistory = document.getElementById('search-history');

    function renderHistory() {
        historyTbody.innerHTML = '';
        
        const filterText = searchHistory.value.toLowerCase();

        const filtered = state.archivedTenants.filter(t => 
            t.name.toLowerCase().includes(filterText) || 
            t.dni.includes(filterText)
        );

        if (filtered.length === 0) {
            historyTbody.innerHTML = '<tr><td colspan="5" style="text-align:center">No hay registros en el historial.</td></tr>';
            return;
        }

        // Ordenar más recientes primero
        filtered.sort((a, b) => new Date(b.checkOut) - new Date(a.checkOut));

        filtered.forEach(t => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td data-label="Hab."><b>${t.roomId}</b></td>
                <td data-label="Nombre Completo"><b>${t.name}</b><br><small>DNI: ${t.dni}</small></td>
                <td data-label="Fecha Ingreso">${t.checkIn || '-'}</td>
                <td data-label="Fecha Salida">${t.checkOut}</td>
                <td data-label="Evaluación / Comportamiento" style="max-width:300px; font-style:italic;">"${t.notes}"</td>
            `;
            historyTbody.appendChild(tr);
        });
    }

    searchHistory.addEventListener('input', renderHistory);

    /* =========================================================================
       RENDER: EDITAR PRECIOS
       ========================================================================= */
    const pricesTbody = document.getElementById('prices-tbody');
    const savePricesBtn = document.getElementById('save-prices-btn');

    function getRoomPrice(roomId) {
        // Si hay un precio guardado en state, úsalo; si no, usa el de CONFIG_ROOMS
        if (state.roomPrices[roomId] !== undefined) {
            return state.roomPrices[roomId];
        }
        const room = CONFIG_ROOMS.find(r => r.id === roomId);
        return room ? room.price : 0;
    }

    function renderPrices() {
        pricesTbody.innerHTML = '';
        CONFIG_ROOMS.forEach(room => {
            const tr = document.createElement('tr');
            const currentPrice = getRoomPrice(room.id);
            
            tr.innerHTML = `
                <td data-label="N° Habitación"><strong>${room.id}</strong></td>
                <td data-label="Piso">${room.floor === 'Cochera' ? 'Cochera' : `Piso ${room.floor}`}</td>
                <td data-label="Tipo">${room.type}</td>
                <td data-label="Precio Actual (S/.)">S/. ${currentPrice}</td>
                <td data-label="Nuevo Precio (S/.)">
                    <input type="number" class="price-input" data-room-id="${room.id}" value="${currentPrice}" min="0" step="1" style="width:100px;padding:6px;">
                </td>
            `;
            pricesTbody.appendChild(tr);
        });
    }

    savePricesBtn.addEventListener('click', () => {
        const inputs = document.querySelectorAll('.price-input');
        inputs.forEach(input => {
            const roomId = input.getAttribute('data-room-id');
            const newPrice = parseFloat(input.value) || 0;
            state.roomPrices[roomId] = newPrice;
        });

        saveState();
        alert('Precios actualizados correctamente.');
        renderMatrix(); // Actualizar la matriz principal si está visible
        renderRoomsDashboard(); // Actualizar dashboard de habitaciones
    });

    /* =========================================================================
       INICIALIZACIÓN DE LA APLICACIÓN
       ========================================================================= */
    loadStateFromLocalStorage();
    renderMatrix();
    renderRoomsDashboard();
    renderHistory();
    renderPrices();
    loadStateFromServer().then(() => {
        renderMatrix();
        renderRoomsDashboard();
        renderHistory();
        renderPrices();
    });

    function cargarPostulantesDesdeSheets() {
        fetch(`${API_BASE}/api/applicants/sync`, {
            method: 'POST'
        })
            .then(response => response.json())
            .then(data => {
                if (!data || !data.ok) {
                    throw new Error(data && data.error ? data.error : 'No se pudo sincronizar postulantes');
                }

                state.applicants = (data.applicants || []).map(a => ({ ...a, name: (a.name || '').toUpperCase(), date: normalizarFecha(a.date) }));
                try {
                    localStorage.setItem('hospedajeState', JSON.stringify(state));
                } catch (error) {
                    console.warn('No se pudo guardar cache local de postulantes:', error);
                }

                renderApplicants();

                if ((data.inserted || 0) === 0) {
                    mostrarMensaje('No hay postulantes nuevos en el Sheet.', 'info');
                } else {
                    const nuevos = data.inserted || 0;
                    mostrarMensaje(`Se agregaron ${nuevos} postulante${nuevos > 1 ? 's' : ''} nuevo${nuevos > 1 ? 's' : ''} desde Google Sheets.`, 'success');
                }
            })
            .catch(err => {
                console.error('Error al cargar datos de Sheets:', err);
                mostrarMensaje('Error al sincronizar postulantes desde servidor.', 'error');
            });
    }

    // Botón para recargar postulantes desde Google Sheets
    const reloadBtn = document.getElementById('reload-sheets-btn');
    if (reloadBtn) {
        reloadBtn.addEventListener('click', () => {
            cargarPostulantesDesdeSheets();
        });
    }

    // Solo cargar postulantes desde Sheets si no hay datos locales
    function cargarPostulantesSiNoHayLocales() {
        if (!state.applicants || state.applicants.length === 0) {
            cargarPostulantesDesdeSheets();
        } else {
            renderApplicants();
        }
    }

    // (Eliminado: doble manejador de navegación que causaba conflicto)

    // ========== EXPORTAR E IMPORTAR JSON (botones globales en header) =============
    const exportBtn = document.getElementById('global-export-btn');
    const importInput = document.getElementById('global-import-input');

    if (exportBtn) {
        exportBtn.addEventListener('click', () => {
            const fecha = new Date().toISOString().slice(0,10);
            const data = {
                exportDate: fecha,
                applicants: state.applicants,
                activeTenants: state.activeTenants,
                archivedTenants: state.archivedTenants,
                roomPrices: state.roomPrices
            };
            const dataStr = JSON.stringify(data, null, 2);
            const blob = new Blob([dataStr], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `hospedaje_backup_${fecha}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            mostrarMensaje('¡Datos grabados correctamente!', 'success');
        });
    }

    if (importInput) {
        importInput.addEventListener('change', (e) => {
            if (!confirm('¡Atención! Si importas, se reemplazará toda la información actual. ¿Deseas continuar?')) {
                importInput.value = '';
                return;
            }
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = function(evt) {
                try {
                    const data = JSON.parse(evt.target.result);
                    if (data && Array.isArray(data.applicants) && Array.isArray(data.activeTenants) && Array.isArray(data.archivedTenants)) {
                        state.applicants = data.applicants;
                        state.activeTenants = data.activeTenants;
                        state.archivedTenants = data.archivedTenants;
                        state.roomPrices = data.roomPrices || {};
                        saveState();
                        renderApplicants();
                        renderMatrix();
                        renderRoomsDashboard();
                        renderHistory();
                        mostrarMensaje('¡Datos importados correctamente!', 'success');
                    } else {
                        mostrarMensaje('El archivo no tiene el formato correcto.', 'error');
                    }
                } catch (err) {
                    mostrarMensaje('Error al leer el archivo JSON.', 'error');
                }
                importInput.value = '';
            };
            reader.readAsText(file);
        });
    }

    function mostrarMensaje(texto, tipo) {
        // Eliminar notificación anterior si existe
        const anterior = document.getElementById('notif-msg');
        if (anterior) anterior.remove();

        const notif = document.createElement('div');
        notif.id = 'notif-msg';
        const color = tipo === 'success' ? '#2ecc71' : tipo === 'info' ? '#3498db' : '#e74c3c';
        notif.style.cssText = `position:fixed;top:20px;left:50%;transform:translateX(-50%);z-index:99999;padding:14px 28px;border-radius:8px;font-size:14px;font-weight:500;box-shadow:0 4px 16px rgba(0,0,0,0.2);background:${color};color:#fff;opacity:0;transition:opacity 0.3s;white-space:nowrap;`;
        notif.textContent = texto;
        document.body.appendChild(notif);

        // Forzar reflow para que la transición funcione
        notif.getBoundingClientRect();
        notif.style.opacity = '1';

        setTimeout(() => {
            notif.style.opacity = '0';
            setTimeout(() => notif.remove(), 350);
        }, 3500);
    }

});
