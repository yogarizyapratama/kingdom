import { useCallback, useEffect, useRef, useState } from 'react';
import { BuildingInspectorModal } from './components/BuildingInspectorModal';
import { GameHud } from './components/GameHud';
import { OutcomeModal, PauseModal } from './components/GameModals';
import { NpcDialogueModal } from './components/NpcDialogueModal';
import { RoyalLedgerModal } from './components/RoyalLedgerModal';
import { TitleScreen } from './components/TitleScreen';
import { kingdomAudio } from './engine/audio';
import { HudProjection, KingdomSceneController } from './engine/KingdomScene';
import {
  advanceWeatherCycle,
  createInitialWorldState,
  demolishBuilding,
  deserializeWorld,
  enactDecree,
  getSnapshot,
  issueNpcOrder,
  performDiplomacy,
  recruitSoldier,
  rewardNpc,
  selectKingWeapon,
  serializeWorld,
  setRationLevel,
  setSquadOrder,
  setTaxRate,
  upgradeBuilding,
} from './simulation/kingdomEngine';
import {
  BuildingType,
  GameScreenState,
  GameSnapshot,
  KingWeaponType,
  NpcOrderType,
  NpcState,
  RationLevel,
  Season,
  SquadOrder,
  TaxRate,
  WorldState,
} from './simulation/types';

const SAVE_STORAGE_KEY = 'valdoria_kingdom_save_v1';

export default function App() {
  const params =
    typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
  const autostart = params?.get('autostart') === '1';
  const initialTimeParam = params?.get('time');

  const initialSeasonParam = params?.get('season');

  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const controllerRef = useRef<KingdomSceneController | null>(null);
  const worldRef = useRef<WorldState>(
    (() => {
      const state = createInitialWorldState();
      if (initialTimeParam !== null) {
        const parsedTime = Number(initialTimeParam);
        if (Number.isFinite(parsedTime)) {
          state.timeOfDay = ((parsedTime % 1) + 1) % 1;
        }
      }
      if (
        initialSeasonParam === 'Spring' ||
        initialSeasonParam === 'Summer' ||
        initialSeasonParam === 'Autumn' ||
        initialSeasonParam === 'Winter'
      ) {
        state.season = initialSeasonParam as Season;
      }
      return state;
    })(),
  );

  const [screenState, setScreenState] = useState<GameScreenState>(autostart ? 'playing' : 'title');
  const [snapshot, setSnapshot] = useState<GameSnapshot>(() => getSnapshot(worldRef.current));
  const [projection, setProjection] = useState<HudProjection>({
    closestNpc: null,
    nearbyBuilding: null,
    nearbyCart: null,
    buildPreview: null,
  });

  const [selectedNpcId, setSelectedNpcId] = useState<string | null>(null);
  const [inspectedBuildingId, setInspectedBuildingId] = useState<string | null>(null);
  const [ledgerOpen, setLedgerOpen] = useState(false);
  const [activeBuildType, setActiveBuildType] = useState<BuildingType | null>(null);
  const [dockCollapsed, setDockCollapsed] = useState(false);
  const [muted, setMuted] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [hasSavedGame, setHasSavedGame] = useState<boolean>(() => {
    try {
      return Boolean(localStorage.getItem(SAVE_STORAGE_KEY));
    } catch {
      return false;
    }
  });
  const [, setTickRevision] = useState(0);

  const toastTimeoutRef = useRef<number>(0);
  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    window.clearTimeout(toastTimeoutRef.current);
    toastTimeoutRef.current = window.setTimeout(() => {
      setToastMessage(null);
    }, 3200);
  }, []);

  // Sync body dataset state for testability and shell coherence
  useEffect(() => {
    document.body.dataset.state = screenState;
  }, [screenState]);

  // Mount Three.js controller once in isolated ref container
  useEffect(() => {
    const mountEl = canvasMountRef.current;
    if (!mountEl) return;

    const controller = new KingdomSceneController(mountEl, worldRef, {
      onSnapshot: (nextSnap) => {
        setSnapshot(nextSnap);
        if (nextSnap.outcome !== 'ongoing') {
          setScreenState('gameover');
        }
      },
      onProjection: (proj) => setProjection(proj),
      onOpenNpc: (npc) => {
        setInspectedBuildingId(null);
        setSelectedNpcId(npc.id);
      },
      onInspectBuilding: (buildingId) => {
        setSelectedNpcId(null);
        setInspectedBuildingId(buildingId);
      },
      onBuildResult: (ok, msg) => {
        showToast(msg);
        if (ok) {
          setActiveBuildType(null);
          controller.setActiveBuildType(null);
        }
      },
      onToast: showToast,
    });
    controllerRef.current = controller;

    return () => {
      window.clearTimeout(toastTimeoutRef.current);
      controller.dispose();
      controllerRef.current = null;
    };
  }, [showToast]);

  // Sync game state & modal status into 3D controller
  const anyModalOpen = Boolean(selectedNpcId) || Boolean(inspectedBuildingId) || ledgerOpen;
  useEffect(() => {
    controllerRef.current?.setGameState(screenState, anyModalOpen);
  }, [screenState, anyModalOpen]);

  useEffect(() => {
    controllerRef.current?.setActiveBuildType(activeBuildType);
  }, [activeBuildType]);

  const startFreshRealm = useCallback(() => {
    worldRef.current = createInitialWorldState();
    controllerRef.current?.resetWorldMeshes();
    setSelectedNpcId(null);
    setInspectedBuildingId(null);
    setLedgerOpen(false);
    setActiveBuildType(null);
    setSnapshot(getSnapshot(worldRef.current));
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    setScreenState('playing');
    kingdomAudio.playRoyalHorn();
    showToast('Welcome to Valdoria, Your Majesty.');
  }, [showToast]);

  const loadSavedRealm = useCallback(() => {
    try {
      const raw = localStorage.getItem(SAVE_STORAGE_KEY);
      if (!raw) return;
      const restored = deserializeWorld(raw);
      if (!restored) {
        showToast('Saved realm could not be loaded.');
        return;
      }
      worldRef.current = restored;
      controllerRef.current?.resetWorldMeshes();
      setSelectedNpcId(null);
      setInspectedBuildingId(null);
      setLedgerOpen(false);
      setActiveBuildType(null);
      setSnapshot(getSnapshot(worldRef.current));
      setScreenState('playing');
      kingdomAudio.playRoyalHorn();
      showToast(`Resumed Day ${restored.day} in Valdoria.`);
    } catch {
      showToast('Unable to read saved kingdom.');
    }
  }, [showToast]);

  const saveCurrentRealm = useCallback(() => {
    try {
      localStorage.setItem(SAVE_STORAGE_KEY, serializeWorld(worldRef.current));
      setHasSavedGame(true);
      kingdomAudio.playCoin();
      showToast(`Kingdom saved on Day ${worldRef.current.day}.`);
    } catch {
      showToast('Could not save to browser storage.');
    }
  }, [showToast]);

  const toggleMute = useCallback(() => {
    setMuted((prev) => {
      const next = !prev;
      kingdomAudio.setMuted(next);
      return next;
    });
  }, []);

  // Global keyboard shortcuts (Start on Enter/Space, Tab Ledger, B Build, M Mute, Esc/P Pause)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (screenState === 'title') {
        if (e.code === 'Enter' || e.code === 'Space') {
          e.preventDefault();
          startFreshRealm();
        }
        return;
      }

      if (e.code === 'KeyM') {
        toggleMute();
        return;
      }

      if (screenState === 'playing') {
        if (e.code === 'Tab') {
          e.preventDefault();
          setSelectedNpcId(null);
          setInspectedBuildingId(null);
          setLedgerOpen((prev) => !prev);
          return;
        }
        if (e.code === 'KeyB' && !selectedNpcId && !inspectedBuildingId && !ledgerOpen) {
          e.preventDefault();
          setActiveBuildType((prev) => (prev ? null : 'cottage'));
          return;
        }
        if (e.code === 'Escape' || e.code === 'KeyP') {
          e.preventDefault();
          if (selectedNpcId) {
            setSelectedNpcId(null);
          } else if (inspectedBuildingId) {
            setInspectedBuildingId(null);
          } else if (ledgerOpen) {
            setLedgerOpen(false);
          } else if (activeBuildType) {
            setActiveBuildType(null);
          } else {
            setScreenState('paused');
          }
        }
      } else if (screenState === 'paused') {
        if (e.code === 'Escape' || e.code === 'KeyP') {
          e.preventDefault();
          setScreenState('playing');
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [screenState, selectedNpcId, inspectedBuildingId, ledgerOpen, activeBuildType, startFreshRealm, toggleMute]);

  const refreshAfterAction = useCallback(() => {
    setSnapshot(getSnapshot(worldRef.current));
    setTickRevision((r) => r + 1);
  }, []);

  const handleIssueNpcOrder = (npcId: string, order: NpcOrderType) => {
    if (issueNpcOrder(worldRef.current, npcId, order)) {
      kingdomAudio.playRoyalHorn();
      refreshAfterAction();
      showToast('Royal order issued.');
    }
  };

  const handleRewardNpc = (npcId: string) => {
    if (rewardNpc(worldRef.current, npcId, 15)) {
      kingdomAudio.playCoin();
      refreshAfterAction();
      showToast('Bestowed 15 Gold.');
    } else {
      showToast('Not enough Gold.');
    }
  };

  const handleRecruit = (role: 'soldier' | 'guard' | 'worker') => {
    const res = recruitSoldier(worldRef.current, role);
    if (res.ok) {
      kingdomAudio.playRoyalHorn();
      refreshAfterAction();
      showToast(`Mustered new ${role}!`);
    } else {
      showToast(res.reason || 'Cannot recruit.');
    }
  };

  const handleSquadOrder = (order: SquadOrder) => {
    setSquadOrder(worldRef.current, order);
    kingdomAudio.playRoyalHorn();
    refreshAfterAction();
    showToast(`Garrison order: ${order.replace(/_/g, ' ')}`);
  };

  const handleSetTaxRate = (rate: TaxRate) => {
    setTaxRate(worldRef.current, rate);
    refreshAfterAction();
    showToast(`Taxes set to ${rate}.`);
  };

  const handleSetRationLevel = (level: RationLevel) => {
    setRationLevel(worldRef.current, level);
    refreshAfterAction();
    const label = level === 'extra' ? 'Double' : level === 'half' ? 'Half' : 'Normal';
    showToast(`Granary rations set to ${label}.`);
  };

  const handleEnactDecree = (decree: 'feast' | 'forestry' | 'muster') => {
    const res = enactDecree(worldRef.current, decree);
    if (res.ok) {
      kingdomAudio.playRoyalHorn();
      refreshAfterAction();
      showToast('Royal decree proclaimed!');
    } else {
      showToast(res.reason || 'Cannot enact decree.');
    }
  };

  const handleDiplomacy = (factionId: string, action: 'trade_envoy' | 'gift' | 'demand_truce') => {
    const res = performDiplomacy(worldRef.current, factionId, action);
    if (res.ok) {
      kingdomAudio.playCoin();
      refreshAfterAction();
      showToast('Diplomatic envoy dispatched.');
    } else {
      showToast(res.reason || 'Diplomacy failed.');
    }
  };

  const handleCycleWeather = () => {
    const next = advanceWeatherCycle(worldRef.current);
    refreshAfterAction();
    const label =
      next === 'sunny'
        ? 'Sunny (100% movement speed)'
        : next === 'rainy'
          ? 'Rainy (80% speed, civilians shelter)'
          : 'Foggy (68% speed, tightened patrols)';
    showToast(`Weather: ${label}`);
  };

  const handleUpgradeBuilding = (buildingId: string) => {
    const res = upgradeBuilding(worldRef.current, buildingId);
    if (res.ok && res.building) {
      kingdomAudio.playRoyalHorn();
      refreshAfterAction();
      showToast(`${res.building.name} upgraded to Tier ${res.building.level}!`);
    } else {
      showToast(res.reason || 'Cannot upgrade building.');
    }
  };

  const handleDemolishBuilding = (buildingId: string) => {
    const res = demolishBuilding(worldRef.current, buildingId);
    if (res.ok) {
      kingdomAudio.playHammer();
      setInspectedBuildingId(null);
      refreshAfterAction();
      showToast(`Dismantled (+${res.refundedWood}w, +${res.refundedStone}s).`);
    } else {
      showToast(res.reason || 'Cannot demolish building.');
    }
  };

  const handleSelectWeapon = (weapon: KingWeaponType) => {
    const res = selectKingWeapon(worldRef.current, weapon);
    if (res.ok) {
      kingdomAudio.playMetalClash();
      refreshAfterAction();
      showToast(`Equipped ${weapon.replace('_', ' ')}!`);
    } else {
      showToast(res.reason || 'Weapon locked.');
    }
  };

  const selectedNpc: NpcState | null = selectedNpcId
    ? worldRef.current.npcs.find((n) => n.id === selectedNpcId) ?? null
    : null;

  const inspectedBuilding = inspectedBuildingId
    ? worldRef.current.buildings.find((b) => b.id === inspectedBuildingId) ?? null
    : null;

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#0e1116]">
      {/* Isolated Three.js Canvas Mount */}
      <div
        ref={canvasMountRef}
        data-testid="kingdom-canvas-mount"
        className="fixed inset-0 w-full h-full"
      />

      {screenState === 'title' && (
        <TitleScreen
          hasSavedGame={hasSavedGame}
          onStartNew={startFreshRealm}
          onContinueSaved={loadSavedRealm}
        />
      )}

      {screenState === 'playing' && (
        <GameHud
          world={worldRef.current}
          snapshot={snapshot}
          projection={projection}
          events={worldRef.current.events}
          activeBuildType={activeBuildType}
          dockCollapsed={dockCollapsed}
          muted={muted}
          toastMessage={toastMessage}
          onToggleDock={() => setDockCollapsed((c) => !c)}
          onSelectBuildType={setActiveBuildType}
          onSquadOrder={handleSquadOrder}
          onOpenLedger={() => {
            setSelectedNpcId(null);
            setInspectedBuildingId(null);
            setLedgerOpen(true);
          }}
          onToggleMount={() => {
            worldRef.current.king.mounted = !worldRef.current.king.mounted;
            kingdomAudio.playFootstep(true);
            refreshAfterAction();
          }}
          onToggleMute={toggleMute}
          onPause={() => setScreenState('paused')}
          onInteractClosest={(npcId) => setSelectedNpcId(npcId)}
          onInspectBuilding={(buildingId) => setInspectedBuildingId(buildingId)}
          onAttack={() => controllerRef.current?.triggerManualAttack()}
          onCycleWeather={handleCycleWeather}
        />
      )}

      {screenState === 'playing' && selectedNpc && (
        <NpcDialogueModal
          npc={selectedNpc}
          worldNpcs={worldRef.current.npcs}
          kingGold={worldRef.current.resources.gold}
          onIssueOrder={handleIssueNpcOrder}
          onReward={handleRewardNpc}
          onRecruit={handleRecruit}
          onClose={() => setSelectedNpcId(null)}
        />
      )}

      {screenState === 'playing' && inspectedBuilding && (
        <BuildingInspectorModal
          building={inspectedBuilding}
          npcs={worldRef.current.npcs}
          resources={worldRef.current.resources}
          onUpgrade={handleUpgradeBuilding}
          onDemolish={handleDemolishBuilding}
          onClose={() => setInspectedBuildingId(null)}
        />
      )}

      {screenState === 'playing' && ledgerOpen && (
        <RoyalLedgerModal
          world={worldRef.current}
          onSetTaxRate={handleSetTaxRate}
          onSetRationLevel={handleSetRationLevel}
          onEnactDecree={handleEnactDecree}
          onRecruit={handleRecruit}
          onSquadOrder={handleSquadOrder}
          onDiplomacy={handleDiplomacy}
          onSelectWeapon={handleSelectWeapon}
          onClose={() => setLedgerOpen(false)}
        />
      )}

      {screenState === 'paused' && (
        <PauseModal
          onResume={() => setScreenState('playing')}
          onSave={saveCurrentRealm}
          onLoad={loadSavedRealm}
          hasSave={hasSavedGame}
          onRestart={startFreshRealm}
          onTitle={() => setScreenState('title')}
        />
      )}

      {screenState === 'gameover' && (
        <OutcomeModal
          snapshot={snapshot}
          onPlayAgain={startFreshRealm}
          onTitle={() => setScreenState('title')}
        />
      )}
    </div>
  );
}
