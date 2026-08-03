import { createHash } from 'node:crypto';

export type TournamentFormat = 8 | 12 | 16;
export type TournamentStage = 'QUALIFIER' | 'SPOTLIGHT' | 'REDEMPTION' | 'REDEMPTION_FINAL' | 'CHAMPIONSHIP_PLAY_IN' | 'CHAMPIONSHIP_SEMI' | 'CHAMPIONSHIP_FINAL';
export type EngineCandidate = { id: string; seed: number; score: number; supportCount: number; firstChoiceCount: number; nominatorIds: string[]; franchiseKey?: string };
export type EngineMatchup = { key: string; stage: TournamentStage; sequence: number; candidateAId: string; candidateBId: string };
export type EngineResult = { matchup: EngineMatchup; winnerId: string; loserId: string; votesA: number; votesB: number; abstentions: number; tieBreak: TieBreakReason | null };
export type TieBreakReason = 'GROUP_INTEREST_SCORE' | 'UNIQUE_NOMINATORS' | 'FIRST_CHOICES' | 'PRE_TOURNAMENT_SCORE' | 'SEEDED_COIN_FLIP';
export type TournamentState = {
  schemaVersion: 1; format: TournamentFormat; roomSeed: string; candidates: EngineCandidate[]; stage: TournamentStage; pending: EngineMatchup[]; completed: EngineResult[];
  strikes: Record<string, number>; qualifierWinners: string[]; qualifierLosers: string[]; spotlightWinners: string[]; redemptionWinners: string[]; playInWinners: string[]; semifinalWinners: string[]; championshipByes: string[]; championId: string | null;
};
export type Ballot = { participantId: string; candidateId: string | null; abstained: boolean };

const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const bySeed = (state: TournamentState, ids: string[]) => [...ids].sort((a,b)=>(state.candidates.find((item)=>item.id===a)?.seed??999)-(state.candidates.find((item)=>item.id===b)?.seed??999));
const candidate = (state: TournamentState, id: string) => { const found=state.candidates.find((item)=>item.id===id); if(!found)throw new Error(`Unknown candidate ${id}`); return found; };
const expectedMatchups: Record<TournamentFormat, number> = { 8: 9, 12: 15, 16: 19 };
export const totalMatchups = (format: TournamentFormat) => expectedMatchups[format];
export const groupInterestScore = (item: Pick<EngineCandidate, 'supportCount' | 'firstChoiceCount'>) =>
  item.supportCount * 2 + item.firstChoiceCount;

export function seedCandidates(input: Omit<EngineCandidate,'seed'>[], roomSeed: string): EngineCandidate[] {
  return [...input].sort((a,b)=>b.supportCount-a.supportCount||b.firstChoiceCount-a.firstChoiceCount||b.score-a.score||digest(`${roomSeed}:${a.id}`).localeCompare(digest(`${roomSeed}:${b.id}`))).map((item,index)=>({...item,seed:index+1}));
}

function compatible(a: EngineCandidate, b: EngineCandidate) {
  const sharedNominator=a.nominatorIds.some((id)=>b.nominatorIds.includes(id));
  const sameFranchise=Boolean(a.franchiseKey&&b.franchiseKey&&a.franchiseKey===b.franchiseKey);
  return !sharedNominator&&!sameFranchise;
}

function openingPairs(candidates: EngineCandidate[]) {
  const remaining=[...candidates]; const pairs:Array<[string,string]>=[];
  while(remaining.length){const first=remaining.shift()!;let partnerIndex=-1;for(let index=remaining.length-1;index>=0;index--)if(compatible(first,remaining[index]!)){partnerIndex=index;break;}if(partnerIndex<0)partnerIndex=remaining.length-1;const [partner]=remaining.splice(partnerIndex,1);pairs.push([first.id,partner!.id]);}
  return pairs;
}

function outerPairs(state: TournamentState, ids: string[]) { const sorted=bySeed(state,ids);const pairs:Array<[string,string]>=[];while(sorted.length){pairs.push([sorted.shift()!,sorted.pop()!]);}return pairs; }
function makeMatchups(state: TournamentState, stage: TournamentStage, pairs: Array<[string,string]>) { return pairs.map(([candidateAId,candidateBId],index)=>({key:`${stage.toLowerCase()}-${state.completed.length+index+1}`,stage,sequence:state.completed.length+index+1,candidateAId,candidateBId})); }

export function createTournament(input: Omit<EngineCandidate,'seed'>[], format: TournamentFormat, roomSeed: string): TournamentState {
  if(input.length!==format)throw new Error(`Format ${format} requires exactly ${format} candidates.`);
  if(new Set(input.map((item)=>item.id)).size!==format)throw new Error('Candidate IDs must be unique.');
  const candidates=seedCandidates(input,roomSeed);
  const state:TournamentState={schemaVersion:1,format,roomSeed,candidates,stage:'QUALIFIER',pending:[],completed:[],strikes:Object.fromEntries(candidates.map((item)=>[item.id,0])),qualifierWinners:[],qualifierLosers:[],spotlightWinners:[],redemptionWinners:[],playInWinners:[],semifinalWinners:[],championshipByes:[],championId:null};
  state.pending=makeMatchups(state,'QUALIFIER',openingPairs(candidates)); return state;
}

export function rankRedemptionCandidates(state: TournamentState) {
  return [...state.qualifierLosers].sort((a,b)=>{const resultA=state.completed.find((item)=>item.matchup.stage==='QUALIFIER'&&item.loserId===a)!;const resultB=state.completed.find((item)=>item.matchup.stage==='QUALIFIER'&&item.loserId===b)!;const shareA=(resultA.votesA+resultA.votesB)?Math.min(resultA.votesA,resultA.votesB)/(resultA.votesA+resultA.votesB):0;const shareB=(resultB.votesA+resultB.votesB)?Math.min(resultB.votesA,resultB.votesB)/(resultB.votesA+resultB.votesB):0;const candidateA=candidate(state,a),candidateB=candidate(state,b);return groupInterestScore(candidateB)-groupInterestScore(candidateA)||candidateB.supportCount-candidateA.supportCount||shareB-shareA||candidateB.score-candidateA.score||candidateA.seed-candidateB.seed;});
}

function beginChampionship(state: TournamentState) {
  const spotlight=bySeed(state,state.spotlightWinners), redemption=bySeed(state,state.redemptionWinners);
  if(state.format===8){state.championshipByes=[spotlight[0]!];state.stage='CHAMPIONSHIP_PLAY_IN';state.pending=makeMatchups(state,state.stage,[[spotlight[1]!,redemption[0]!]]);return;}
  if(state.format===12){state.stage='CHAMPIONSHIP_SEMI';state.pending=makeMatchups(state,state.stage,[[spotlight[0]!,redemption[0]!],[spotlight[1]!,spotlight[2]!]]);return;}
  state.championshipByes=[spotlight[0]!,spotlight[1]!];state.stage='CHAMPIONSHIP_PLAY_IN';state.pending=makeMatchups(state,state.stage,[[spotlight[2]!,redemption[0]!],[spotlight[3]!,redemption[1]!]]);
}

function advanceStage(state: TournamentState) {
  if(state.stage==='QUALIFIER'){state.stage='SPOTLIGHT';state.pending=makeMatchups(state,state.stage,outerPairs(state,state.qualifierWinners));return;}
  if(state.stage==='SPOTLIGHT'){const count=state.format===8?2:4;const redemption=rankRedemptionCandidates(state).slice(0,count);state.stage='REDEMPTION';state.pending=makeMatchups(state,state.stage,outerPairs(state,redemption));return;}
  if(state.stage==='REDEMPTION'&&state.format===12){state.stage='REDEMPTION_FINAL';state.pending=makeMatchups(state,state.stage,[[state.redemptionWinners[0]!,state.redemptionWinners[1]!]]);state.redemptionWinners=[];return;}
  if(state.stage==='REDEMPTION'||state.stage==='REDEMPTION_FINAL'){beginChampionship(state);return;}
  if(state.stage==='CHAMPIONSHIP_PLAY_IN'&&state.format===8){state.stage='CHAMPIONSHIP_FINAL';state.pending=makeMatchups(state,state.stage,[[state.championshipByes[0]!,state.playInWinners[0]!]]);return;}
  if(state.stage==='CHAMPIONSHIP_PLAY_IN'){state.stage='CHAMPIONSHIP_SEMI';state.pending=makeMatchups(state,state.stage,[[state.championshipByes[0]!,state.playInWinners[1]!],[state.championshipByes[1]!,state.playInWinners[0]!]]);return;}
  if(state.stage==='CHAMPIONSHIP_SEMI'){state.stage='CHAMPIONSHIP_FINAL';state.pending=makeMatchups(state,state.stage,[[state.semifinalWinners[0]!,state.semifinalWinners[1]!]]);}
}

export function advanceTournament(input: TournamentState, resolution: Omit<EngineResult,'matchup'>): TournamentState {
  const state=structuredClone(input);const matchup=state.pending[0];if(!matchup)throw new Error('Tournament has no pending matchup.');
  const ids=new Set([matchup.candidateAId,matchup.candidateBId]);if(!ids.has(resolution.winnerId)||!ids.has(resolution.loserId)||resolution.winnerId===resolution.loserId)throw new Error('Result candidates do not match the pending matchup.');
  state.pending.shift();state.completed.push({...resolution,matchup});state.strikes[resolution.loserId]=(state.strikes[resolution.loserId]??0)+1;
  if(matchup.stage==='QUALIFIER'){state.qualifierWinners.push(resolution.winnerId);state.qualifierLosers.push(resolution.loserId);}
  else if(matchup.stage==='SPOTLIGHT')state.spotlightWinners.push(resolution.winnerId);
  else if(matchup.stage==='REDEMPTION'||matchup.stage==='REDEMPTION_FINAL')state.redemptionWinners.push(resolution.winnerId);
  else if(matchup.stage==='CHAMPIONSHIP_PLAY_IN')state.playInWinners.push(resolution.winnerId);
  else if(matchup.stage==='CHAMPIONSHIP_SEMI')state.semifinalWinners.push(resolution.winnerId);
  else if(matchup.stage==='CHAMPIONSHIP_FINAL')state.championId=resolution.winnerId;
  if(!state.pending.length&&!state.championId)advanceStage(state);return state;
}

export function resolveBallots(input:{candidateA:EngineCandidate;candidateB:EngineCandidate;ballots:Ballot[];roomSeed:string;matchupKey:string}) {
  const votesA=input.ballots.filter((vote)=>!vote.abstained&&vote.candidateId===input.candidateA.id).length;const votesB=input.ballots.filter((vote)=>!vote.abstained&&vote.candidateId===input.candidateB.id).length;const abstentions=input.ballots.filter((vote)=>vote.abstained).length;
  if(votesA!==votesB){const winner=votesA>votesB?input.candidateA:input.candidateB;return{winnerId:winner.id,loserId:winner.id===input.candidateA.id?input.candidateB.id:input.candidateA.id,votesA,votesB,abstentions,tieBreak:null as TieBreakReason|null};}
  const comparisons:Array<[TieBreakReason,number,number]>=[['GROUP_INTEREST_SCORE',groupInterestScore(input.candidateA),groupInterestScore(input.candidateB)],['UNIQUE_NOMINATORS',input.candidateA.supportCount,input.candidateB.supportCount],['FIRST_CHOICES',input.candidateA.firstChoiceCount,input.candidateB.firstChoiceCount],['PRE_TOURNAMENT_SCORE',input.candidateA.score,input.candidateB.score]];
  for(const[tieBreak,a,b]of comparisons)if(a!==b){const winner=a>b?input.candidateA:input.candidateB;return{winnerId:winner.id,loserId:winner.id===input.candidateA.id?input.candidateB.id:input.candidateA.id,votesA,votesB,abstentions,tieBreak};}
  const winner=digest(`${input.roomSeed}:${input.matchupKey}:${input.candidateA.id}:${input.candidateB.id}`).charCodeAt(0)%2===0?input.candidateA:input.candidateB;return{winnerId:winner.id,loserId:winner.id===input.candidateA.id?input.candidateB.id:input.candidateA.id,votesA,votesB,abstentions,tieBreak:'SEEDED_COIN_FLIP' as const};
}
