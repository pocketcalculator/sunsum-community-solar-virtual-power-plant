const $ = (selector) => document.querySelector(selector);
let currentAssessmentId = null;
let demoImages = new Map();
let demoScenarios = new Map();
let assessmentRows = [];

const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
const title = (value) => String(value || '').replaceAll('_', ' ').replace(/\b\w/g, c => c.toUpperCase());
const money = (value) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);
const number = (value) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value);
const idempotencyKey = (prefix) => `${prefix}-${crypto.randomUUID()}`;

async function api(path, options = {}) {
    const response = await fetch(path, options);
    if (!response.ok) {
        const body = await response.json().catch(() => ({ detail: response.statusText }));
        throw new Error(Array.isArray(body.detail) ? body.detail.map(x => x.msg).join('; ') : body.detail);
    }
    return response.json();
}

function formObject(form) {
    const values = Object.fromEntries(new FormData(form));
    for (const [key, value] of Object.entries(values)) {
        if (value === '') delete values[key];
        else if (['latitude', 'longitude', 'usable_roof_area_sqft', 'usable_land_area_acres', 'estimated_shading_percent', 'remaining_roof_life_years', 'proposed_capacity_kw'].includes(key)) values[key] = Number(value);
        else if (['ownership_verified', 'site_control_verified'].includes(key)) values[key] = value === 'true';
    }
    return values;
}

function listInto(selector, items, fallback) {
    $(selector).innerHTML = (items?.length ? items : [fallback]).map(item => `<li>${escapeHtml(item)}</li>`).join('');
}

async function loadAssessments() {
    assessmentRows = await api('/api/assessments');
    renderAssessmentHistory();
}

function renderAssessmentHistory() {
    const query = $('#historySearch').value.trim().toLowerCase();
    const status = $('#historyStatus').value;
    const rows = assessmentRows.filter(row => (!query || row.site_id.toLowerCase().includes(query)) && (!status || row.review_status === status));
    $('#assessmentList').innerHTML = rows.length ? rows.map(row => {
        const disposition = row.final_human_decision ? ` · ${title(row.final_human_decision)}` : '';
        return `<button class="assessment-item ${row.id === currentAssessmentId ? 'active' : ''}" data-id="${row.id}"><strong>${escapeHtml(row.site_id)}</strong><span>${escapeHtml(title(row.current_recommendation))} · ${escapeHtml(title(row.review_status))}${escapeHtml(disposition)}</span><small>${new Date(row.updated_at).toLocaleDateString()}</small></button>`;
    }).join('') : '<p class="muted">No matching assessments.</p>';
    document.querySelectorAll('.assessment-item').forEach(button => button.addEventListener('click', () => showAssessment(button.dataset.id)));
}

async function loadDemoScenarios() {
    const data = await api('/api/demo-scenarios');
    demoScenarios = new Map(data.scenarios.map(scenario => [scenario.id, scenario]));
    $('#demoWarning').textContent = data.dataset.warning;
    $('#demoScenarioList').innerHTML = data.scenarios.map(scenario => `<button type="button" class="demo-scenario" data-scenario-id="${escapeHtml(scenario.id)}"><strong>${escapeHtml(scenario.label)}</strong><span>${escapeHtml(scenario.description)}</span><small>Expected: ${escapeHtml(title(scenario.expected_recommendation))}</small></button>`).join('');
    document.querySelectorAll('.demo-scenario').forEach(button => button.addEventListener('click', async () => {
        document.querySelectorAll('.demo-scenario').forEach(item => { item.disabled = true; });
        $('#demoMessage').textContent = `Selecting the matching image and running ${button.querySelector('strong').textContent}...`;
        try {
            populateForm(demoScenarios.get(button.dataset.scenarioId).payload);
            await selectDemoImage(button.dataset.scenarioId);
            const row = await api(`/api/demo-scenarios/${button.dataset.scenarioId}/assessments`, { method: 'POST' });
            currentAssessmentId = row.id;
            await showAssessment(row.id);
            await uploadSelectedImage(row.id);
            $('#demoMessage').textContent = 'Recommendation and matching image analysis saved. Continue with human review below.';
        } catch (error) { $('#demoMessage').textContent = error.message; }
        finally { document.querySelectorAll('.demo-scenario').forEach(item => { item.disabled = false; }); }
    }));
}

function populateForm(payload) {
    $('#siteForm').reset();
    for (const [name, value] of Object.entries({ ...payload.site, ...payload.financial })) {
        const field = document.querySelector(`#siteForm [name="${name}"]`);
        if (!field || value === null || typeof value === 'object') continue;
        field.value = String(value);
    }
    for (const [key, value] of Object.entries(payload.site.constraint_status || {})) {
        const field = document.querySelector(`#siteForm [name="constraint_${key}"]`);
        if (field) field.value = value;
    }
}

async function loadDemoImages() {
    const data = await api('/api/demo-images');
    demoImages = new Map(data.images.map(image => [image.id, image]));
    $('#demoImageList').innerHTML = data.images.map(image => `<button type="button" class="demo-image-button" data-image-id="${escapeHtml(image.id)}"><strong>${escapeHtml(image.label)}</strong><span>${escapeHtml(image.filename)}</span></button>`).join('');
    document.querySelectorAll('.demo-image-button').forEach(button => button.addEventListener('click', async () => {
        try { await selectDemoImage(button.dataset.imageId); }
        catch (error) { $('#imageSelectionMessage').textContent = error.message; }
    }));
}

async function selectDemoImage(scenarioId) {
    const image = demoImages.get(scenarioId);
    if (!image) throw new Error('Matching synthetic image is unavailable.');
    const response = await fetch(`/api/demo-images/${scenarioId}`);
    if (!response.ok) throw new Error('Could not load the synthetic image.');
    const file = new File([await response.blob()], image.filename, { type: image.media_type });
    const transfer = new DataTransfer();
    transfer.items.add(file);
    $('#siteImage').files = transfer.files;
    $('#imageSelectionMessage').textContent = `${image.filename} selected. Expected recommendation when paired with its scenario: ${title(image.expected_recommendation)}.`;
}

async function uploadSelectedImage(assessmentId) {
    const image = $('#siteImage').files[0];
    if (!image) return;
    const body = new FormData();
    body.append('file', image);
    const result = await api(`/api/assessments/${assessmentId}/images`, { method: 'POST', body });
    await showAssessment(assessmentId);
    $('#imageAnalysis').hidden = false;
    $('#imageProviderStatus').textContent = title(result.provider_status);
    $('#imageObservations').innerHTML = result.observations.length ? result.observations.map(observation => `<div class="provider"><strong>${escapeHtml(title(observation.key))}</strong><span>${escapeHtml(observation.value)} · ${escapeHtml(title(observation.uncertainty))} uncertainty</span></div>`).join('') : '<p class="muted">No automated observations. Manual review is required.</p>';
    listInto('#imageWarnings', result.warnings, 'Image observations require human review.');
}

async function showAssessment(id) {
    currentAssessmentId = id;
    const row = await api(`/api/assessments/${id}`);
    $('#emptyResult').hidden = true;
    $('#resultContent').hidden = false;
    $('#imageAnalysis').hidden = true;
    const result = row.assessment;
    $('#recommendationTag').textContent = title(result.recommendation);
    $('#recommendationTag').dataset.recommendation = result.recommendation;
    $('#reviewTag').textContent = title(row.review_status);
    $('#resultTitle').textContent = `${row.site_id} preliminary recommendation`;
    $('#downloadReport').href = `/api/assessments/${id}/report`;
    $('#explanation').textContent = result.explanation;
    $('#completeness').textContent = `${result.evidence_completeness_score}%`;
    $('#meterFill').style.width = `${result.evidence_completeness_score}%`;
    $('#confidence').textContent = result.confidence_description;
    listInto('#supporting', result.supporting_evidence, 'No supporting evidence recorded yet.');
    listInto('#risks', result.constraints_and_risks, 'No confirmed constraints recorded.');
    listInto('#missing', result.missing_information, 'No missing evidence recorded.');
    listInto('#actions', result.required_next_actions, 'Complete human technical review.');
    $('#providers').innerHTML = Object.entries(row.provider_results).map(([key, provider]) => `<div class="provider"><strong>${escapeHtml(title(key))}</strong><span>${escapeHtml(title(provider.status))}${provider.safe_message ? ` · ${escapeHtml(provider.safe_message)}` : ''}</span></div>`).join('');
    $('#similarSites').innerHTML = result.similar_historical_sites?.length ? result.similar_historical_sites.map(site => `<div class="provider"><strong>${escapeHtml(site.address)}</strong><span>${escapeHtml(title(site.historical_label))} · ${escapeHtml(site.mount_type || 'Unknown mount')} · label derived from worksheet placement</span></div>`).join('') : '<p class="muted">No normalized historical records available.</p>';
    renderFinancial(row.financial, row.final_human_decision === 'accept');
    renderWorkflow(row);
    await loadAudit(id);
    await loadAssessments();
}

function renderFinancial(financial, feasible) {
    $('#financialLocked').hidden = feasible && Boolean(financial);
    if (!financial || !feasible) { $('#financialResult').hidden = true; return; }
    $('#financialResult').hidden = false;
    $('#financialSummary').innerHTML = `<div><span>Net project amount</span><strong>${money(financial.net_project_amount)}</strong></div><div><span>Year 1 revenue</span><strong>${money(financial.year_1_revenue)}</strong></div><div><span>Breakeven year</span><strong>${financial.breakeven_year ?? 'Beyond term'}</strong></div>`;
    $('#schedule').innerHTML = financial.schedule.map(row => `<tr><td>${row.year}</td><td>${number(row.production_kwh)}</td><td>$${row.ppa_rate.toFixed(4)}</td><td>${money(row.revenue)}</td><td>${money(row.recurring_balance)}</td><td>${row.reached_breakeven ? 'Reached' : money(row.breakeven_status)}</td></tr>`).join('');
}

function renderWorkflow(row = null) {
    const stages = [...document.querySelectorAll('[data-flow-stage]')];
    stages.forEach(stage => stage.classList.remove('active', 'complete'));
    if (!row) {
        stages[0]?.classList.add('active');
        return;
    }
    stages.slice(0, 4).forEach(stage => stage.classList.add('complete'));
    const reviewStage = document.querySelector('[data-flow-stage="review"]');
    const downstreamStage = document.querySelector('[data-flow-stage="downstream"]');
    const determined = row.review_status === 'human_determined';
    reviewStage.classList.add(determined ? 'complete' : 'active');
    if (row.final_human_decision === 'accept') downstreamStage.classList.add('active');

    const accepted = row.final_human_decision === 'accept';
    const rejected = row.final_human_decision === 'reject';
    $('#investorTitle').textContent = accepted ? 'Ready for investor experience' : rejected ? 'Project not released' : 'Investor experience locked';
    $('#investorMessage').textContent = accepted ? 'Financial projections are available and this project can enter investor discovery and interest workflows.' : rejected ? 'The operator marked this project not feasible, so it remains outside investor discovery.' : 'A project becomes visible to investors after a feasible operator decision.';
    $('#investorTag').textContent = accepted ? 'READY' : rejected ? 'NOT FEASIBLE' : 'PENDING REVIEW';
    $('#investorGate').dataset.state = accepted ? 'ready' : rejected ? 'blocked' : 'pending';
}

async function loadAudit(id) {
    const events = await api(`/api/assessments/${id}/audit`);
    $('#auditHistory').innerHTML = events.map(event => `<div class="event"><strong>${escapeHtml(title(event.event_type))}</strong><span>${escapeHtml(event.actor)} · ${new Date(event.created_at).toLocaleString()}</span></div>`).join('');
    const rescreen = [...events].reverse().find(event => event.event_type === 'assessment_rescreened' && event.payload.changes);
    renderChangeComparison(rescreen?.payload.changes);
}

function renderChangeComparison(changes) {
    const panel = $('#changeComparison');
    if (!changes) { panel.hidden = true; return; }
    const recommendation = changes.recommendation;
    const completeness = changes.evidence_completeness_score;
    const evidenceChanges = [
        ['Supporting evidence', changes.supporting_evidence],
        ['Constraints and risks', changes.constraints_and_risks],
        ['Missing information', changes.missing_information],
    ];
    const details = evidenceChanges.flatMap(([label, values]) => [
        ...(values.added || []).map(value => `<li><strong>Added to ${escapeHtml(label)}:</strong> ${escapeHtml(value)}</li>`),
        ...(values.removed || []).map(value => `<li><strong>Removed from ${escapeHtml(label)}:</strong> ${escapeHtml(value)}</li>`),
    ]);
    const changed = recommendation.previous !== recommendation.current || completeness.previous !== completeness.current || details.length;
    const summary = `<div class="change-metrics"><div><span>Recommendation</span><strong>${escapeHtml(title(recommendation.previous))} → ${escapeHtml(title(recommendation.current))}</strong></div><div><span>Completeness</span><strong>${completeness.previous}% → ${completeness.current}%</strong></div></div>`;
    const message = changed ? '' : '<p>No material rule output changed; the available evidence was re-evaluated.</p>';
    $('#changeSummary').innerHTML = `${summary}${details.length ? `<ul>${details.join('')}</ul>` : message}`;
    panel.hidden = false;
}

$('#siteForm').addEventListener('submit', async event => {
    event.preventDefault();
    const button = event.submitter;
    button.disabled = true;
    $('#formMessage').textContent = 'Validating evidence and running rules…';
    try {
        const all = formObject(event.currentTarget);
        const financialKeys = ['project_cost', 'annual_production_kwh', 'ppa_rate', 'itc_rate_percent', 'production_loss_percent', 'ppa_escalator_percent', 'hurdle_rate_percent', 'incentives', 'donations', 'analysis_period_years'];
        const financial = {};
        financialKeys.forEach(key => { financial[key] = Number(all[key]); delete all[key]; });
        const constraint_status = {};
        ['interconnection', 'permitting', 'zoning', 'environmental'].forEach(key => {
            constraint_status[key] = all[`constraint_${key}`];
            delete all[`constraint_${key}`];
        });
        all.constraint_status = constraint_status;
        const row = await api('/api/assessments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idempotency_key: idempotencyKey('assessment'), submitted_by: 'Demo site owner', site: all, financial }) });
        currentAssessmentId = row.id;
        await showAssessment(row.id);
        await uploadSelectedImage(row.id);
        $('#formMessage').textContent = 'Assessment and image evidence saved. Human review is required.';
    } catch (error) { $('#formMessage').textContent = error.message; }
    finally { button.disabled = false; }
});

$('#reviewForm').addEventListener('submit', async event => {
    event.preventDefault();
    if (!currentAssessmentId) return;
    const values = Object.fromEntries(new FormData(event.currentTarget));
    if (!values.recommendation_override) delete values.recommendation_override;
    $('#reviewMessage').textContent = 'Recording immutable review event…';
    try {
        await api(`/api/assessments/${currentAssessmentId}/reviews`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...values, idempotency_key: idempotencyKey('review') }) });
        $('#reviewMessage').textContent = 'Human determination recorded.';
        await showAssessment(currentAssessmentId);
    } catch (error) { $('#reviewMessage').textContent = error.message; }
});

$('#newBtn').addEventListener('click', () => { currentAssessmentId = null; $('#emptyResult').hidden = false; $('#resultContent').hidden = true; $('#siteForm').reset(); renderWorkflow(); window.scrollTo({ top: 0, behavior: 'smooth' }); });
$('#historySearch').addEventListener('input', renderAssessmentHistory);
$('#historyStatus').addEventListener('change', renderAssessmentHistory);

(async function initialize() {
    try {
        const health = await api('/api/health');
        const configured = Object.values(health.providers).filter(value => value === 'configured').length;
        $('#systemLabel').textContent = `Local API ready · ${configured} live provider${configured === 1 ? '' : 's'}`;
        await loadDemoImages();
        await loadDemoScenarios();
        await loadAssessments();
    } catch (error) { $('#systemLabel').textContent = 'API unavailable'; }
})();
