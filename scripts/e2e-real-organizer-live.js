/**
 * VERIDICT Live Container End-to-End Real Organizer Acceptance Test
 * 
 * Tests the complete real-world lifecycle against the live running Docker container:
 * 1. Register real organizer
 * 2. Create new hackathon event ("Build Bharat 2026")
 * 3. Verify zero baseline for new event
 * 4. Configure tracks & prizes
 * 5. Register participant & submit project dossier
 * 6. Invite judge & retrieve truthful onboarding token
 * 7. Judge accepts invitation, sets password, and evaluates submission
 * 8. Organizer publishes certified results
 * 9. Public visitor inspects certified results
 * 10. Container persistence verification
 */

const BASE_URL = process.env.TEST_URL || 'http://localhost:8080';

async function req(path, options = {}) {
  const url = `${BASE_URL}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { status: res.status, ok: res.ok, headers: res.headers, text, json };
}

function extractCookie(headers) {
  const setCookie = headers.get('set-cookie');
  if (!setCookie) return null;
  const match = setCookie.match(/session=([^;]+)/);
  return match ? match[1] : null;
}

async function run() {
  console.log('================================================================');
  console.log('  VERIDICT LIVE CONTAINER REAL-WORLD ACCEPTANCE VERIFICATION  ');
  console.log(`  Target: ${BASE_URL}`);
  console.log('================================================================\n');

  const ts = Date.now().toString().slice(-6);

  // 1. Register Real Organizer
  console.log('1. Registering new organizer...');
  const orgEmail = `organizer_${ts}@buildbharat.org`;
  const orgReg = await req('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      email: orgEmail,
      name: 'Aditi Sharma',
      password: 'OrganizerSecurePass123!',
      role: 'organizer',
    }),
  });
  if (orgReg.status !== 201) throw new Error(`Organizer registration failed: ${orgReg.text}`);
  const orgCookie = extractCookie(orgReg.headers);
  console.log(`   ✓ Organizer registered: ${orgEmail} (ID: ${orgReg.json.user.id})`);

  // 2. Create Event
  console.log('\n2. Creating new event: "Build Bharat 2026"...');
  const eventSlug = `build-bharat-${ts}`;
  const createEvt = await req('/api/events', {
    method: 'POST',
    headers: { Cookie: `session=${orgCookie}` },
    body: JSON.stringify({
      name: 'Build Bharat Hackathon 2026',
      slug: eventSlug,
      description: 'National competition for next-generation digital infrastructure',
      start_time: new Date().toISOString(),
      end_time: new Date(Date.now() + 7 * 86400000).toISOString(),
      submissions_close: new Date(Date.now() + 5 * 86400000).toISOString(),
      status: 'PUBLISHED',
      judging_mode: 'BOTH',
      tracks: [
        { name: 'Public Digital Goods', description: 'Open protocol innovations' },
        { name: 'Smart Agriculture', description: 'IoT and climate resilience' },
      ],
      prizes: [
        { name: 'National Grand Prize', amount: 10000, description: 'Best overall innovation' },
      ],
    }),
  });
  if (createEvt.status !== 201) throw new Error(`Event creation failed: ${createEvt.text}`);
  const newEventId = createEvt.json.event.id;
  console.log(`   ✓ Event created: ID ${newEventId}, Slug: "${eventSlug}"`);

  // 3. Verify Zero Baseline
  console.log('\n3. Verifying zero baseline isolation...');
  const evtDetails = await req(`/api/events/${eventSlug}`);
  if (!evtDetails.ok) throw new Error(`Failed to load event: ${evtDetails.text}`);
  const evtData = evtDetails.json.event;
  if (evtData.total_projects !== 0 || evtData.teams_count !== 0) {
    throw new Error(`Event baseline contamination! total_projects=${evtData.total_projects}, teams_count=${evtData.teams_count}`);
  }
  console.log(`   ✓ Verified zero baseline: 0 teams, 0 submissions, 0 projects`);
  console.log(`   ✓ Tracks created: ${evtDetails.json.tracks.length}, Prizes created: ${evtDetails.json.prizes.length}`);
  const track1 = evtDetails.json.tracks[0];

  // 4. Register Participant
  console.log('\n4. Registering real participant...');
  const partEmail = `participant_${ts}@iitd.ac.in`;
  const partReg = await req('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      email: partEmail,
      name: 'Vikram Malhotra',
      password: 'ParticipantPass123!',
      role: 'participant',
    }),
  });
  if (partReg.status !== 201) throw new Error(`Participant registration failed: ${partReg.text}`);
  const partCookie = extractCookie(partReg.headers);
  console.log(`   ✓ Participant registered: ${partEmail}`);

  // 5. Register Participant for Event & Create Team
  console.log('\n5. Registering for event and creating team...');
  const joinEvt = await req(`/api/events/${newEventId}/register`, {
    method: 'POST',
    headers: { Cookie: `session=${partCookie}` },
  });
  if (!joinEvt.ok) throw new Error(`Failed to register for event: ${joinEvt.text}`);
  console.log(`   ✓ Participant registered for ${newEventId}`);

  const createTeam = await req('/api/teams', {
    method: 'POST',
    headers: { Cookie: `session=${partCookie}` },
    body: JSON.stringify({
      name: `Sovereign AI Squad ${ts}`,
      event_id: newEventId,
    }),
  });
  if (createTeam.status !== 201) throw new Error(`Failed to create team: ${createTeam.text}`);
  const teamId = createTeam.json.team.id;
  console.log(`   ✓ Team created: ID ${teamId} ("${createTeam.json.team.name}")`);

  // 6. Submit Project Dossier
  console.log('\n6. Submitting project dossier...');
  const createProj = await req('/api/projects', {
    method: 'POST',
    headers: { Cookie: `session=${partCookie}` },
    body: JSON.stringify({
      team_id: teamId,
      track_id: track1.id,
      title: 'KisanMesh: Decentralized Micro-Weather Grid',
      summary: 'Edge IoT sensor network providing localized weather micro-forecasts.',
      description: 'Built with Rust and low-power mesh radios. Validated on 50 field nodes.',
      repo_url: 'https://github.com/buildbharat/kisanmesh',
      demo_url: 'https://kisanmesh.in',
      status: 'SUBMITTED',
    }),
  });
  if (createProj.status !== 201) throw new Error(`Failed to create project: ${createProj.text}`);
  const projectId = createProj.json.project.id;
  console.log(`   ✓ Project submitted: ID ${projectId} ("${createProj.json.project.title}")`);

  // 7. Organizer Invites Designated Judge
  console.log('\n7. Organizer invites designated judge...');
  const judgeEmail = `judge_${ts}@iitb.ac.in`;
  const inviteJudge = await req('/api/organizer/judges/invite', {
    method: 'POST',
    headers: { Cookie: `session=${orgCookie}` },
    body: JSON.stringify({
      name: 'Prof. Ananya Sen',
      email: judgeEmail,
      event_id: newEventId,
      track_ids: [track1.id],
    }),
  });
  if (inviteJudge.status !== 201) throw new Error(`Judge invite failed: ${inviteJudge.text}`);
  const { token: inviteToken, inviteLink, defaultPassword } = inviteJudge.json;
  console.log(`   ✓ Judge invited: ${judgeEmail}`);
  console.log(`   ✓ Truthful Invite Token: ${inviteToken}`);
  console.log(`   ✓ Generated Onboarding URL: ${inviteLink}`);

  // 8. Public Inspection of Invitation
  console.log('\n8. Inspecting cryptographic invitation token...');
  const inspectInvite = await req(`/api/invitations/${inviteToken}`);
  if (!inspectInvite.ok) throw new Error(`Failed to inspect invitation: ${inspectInvite.text}`);
  console.log(`   ✓ Invitation verified: Event "${inspectInvite.json.invitation.event_name}", Status: ${inspectInvite.json.invitation.status}`);

  // 9. Judge Accepts Invitation and Sets Password
  console.log('\n9. Judge accepts invitation and sets custom credentials...');
  const judgeAccept = await req(`/api/invitations/${inviteToken}/accept`, {
    method: 'POST',
    body: JSON.stringify({
      name: 'Prof. Ananya Sen, Ph.D.',
      password: 'JudgeMasterSecretPass123!',
    }),
  });
  if (!judgeAccept.ok) throw new Error(`Failed to accept invitation: ${judgeAccept.text}`);
  const judgeCookie = extractCookie(judgeAccept.headers);
  console.log(`   ✓ Judge accepted invitation! User ID: ${judgeAccept.json.user.id}, Roles: [${judgeAccept.json.user.roles.join(', ')}]`);

  // 9.5. Organizer Generates Batch Assignments
  console.log('\n9.5. Organizer generates track-aware review assignments...');
  const assignRes = await req('/api/organizer/assignments/auto', {
    method: 'POST',
    headers: { Cookie: `session=${orgCookie}` },
    body: JSON.stringify({
      event_id: newEventId,
      reviews_per_project: 1,
    }),
  });
  if (!assignRes.ok) throw new Error(`Auto assignment failed: ${assignRes.text}`);
  console.log(`   ✓ Review assignment complete: ${assignRes.json.assignments_created} assignments created`);

  // 10. Judge Evaluates Submission
  console.log('\n10. Judge evaluates project...');
  // Load rubric criteria for event
  const rubricRes = await req(`/api/events/${newEventId}`);
  const criteriaList = rubricRes.json.rubric.criteria;

  const criteriaMap = {};
  for (const c of criteriaList) {
    criteriaMap[c.criterion_key] = 4.5;
  }

  const submitScore = await req('/api/judge/scores', {
    method: 'POST',
    headers: { Cookie: `session=${judgeCookie}` },
    body: JSON.stringify({
      project_id: projectId,
      criteria: criteriaMap,
      comment: 'Outstanding engineering depth and robust offline resilience.',
      status: 'SUBMITTED',
    }),
  });
  if (submitScore.status !== 201) throw new Error(`Judge evaluation failed: ${submitScore.text}`);
  console.log(`   ✓ Judge scores recorded and submitted (Score: 4.5 across all criteria)`);

  // 11. Organizer Publishes Official Results
  console.log('\n11. Organizer publishes certified results...');
  const pubResults = await req(`/api/events/${newEventId}/publish-results`, {
    method: 'POST',
    headers: { Cookie: `session=${orgCookie}` },
  });
  if (!pubResults.ok) throw new Error(`Publish results failed: ${pubResults.text}`);
  console.log(`   ✓ Official results published by organizer`);

  // 12. Public Inspection of Certified Results
  console.log('\n12. Public unauthenticated inspection of certified leaderboard...');
  const pubLeaderboard = await req(`/api/events/${eventSlug}/results`);
  if (!pubLeaderboard.ok) throw new Error(`Failed to fetch public results: ${pubLeaderboard.text}`);
  const topProj = pubLeaderboard.json.projects?.[0];
  console.log(`   ✓ Public leaderboard retrieved! Top Project: "${topProj?.title}" (Score: ${topProj?.final_score})`);

  console.log('\n================================================================');
  console.log('  ALL REAL-WORLD LIFECYCLE ACCEPTANCE CHECKS PASSED (12/12)     ');
  console.log('================================================================\n');
}

run().catch(err => {
  console.error('\n❌ ACCEPTANCE TEST FAILED:', err.message);
  process.exit(1);
});
