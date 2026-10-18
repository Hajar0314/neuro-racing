// Variables Globales partagées
// Utilisation de 'var' pour garantir l'accès via 'window' ou portée globale simple

var TOTAL_POP = 50;
var NB_ASSETS = 6; // 5 rayons + 1 vitesse
var SIGHT_DIST = 150;
var FOV = Math.PI / 1.5;

var cars = [];
var savedCars = [];
var raceCars = [];
var walls = [];
var checkpoints = [];
var currentTrackPath = []; // Stockage du tracé LEGO central
var currentLandscaping = [];
var currentInnerBoundary = [];
var currentOuterBoundary = []; // bord extérieur de la piste (vibreurs, lignes de bord)
var currentScenery = [];        // décor hors piste : arbres, buissons, rochers, fleurs
var soundEngine = null;         // sons synthétisés (Sound.js) ; créé dans setup()
var effects = null;             // particules et flashs (Effects.js) ; créé dans setup()
var trackLayer = null;          // calque p5.Graphics du décor fixe, peint une fois et recopié à chaque image
var customTrackPath = [];
var TRACK_POINT_SPACING = 14;
var TRACK_LENGTH = 0;
var trainedBrains = [];
var nextCarColor = 0;

var startX = 115;
var startY = 115;
var generation = 0;
var bestRaceCar = null;

// Configurations
var MUTATION_RATE = 0.15;
var RANDOM_SEED = null; // graine imposée par l'utilisateur (null = automatique : une graine est tirée à chaque expérience)
var activeSeed = null; // graine de l'expérience en cours (affichée, pour pouvoir la rejouer)
var CROSSOVER_RATE = 0.7; // probabilité qu'un enfant naisse du croisement de deux parents (sinon : copie d'un seul)
var ELITE_COUNT = 1; // meilleurs cerveaux reconduits tels quels (sans mutation) à la génération suivante
var SUCCESS_RATE_TARGET = 0.6;
var GAME_SPEED_LIMIT = 6;
var CAR_ACCELERATION = 0.5;
var HIDDEN_NODES = 20;
var HIDDEN_ACTIVATION = "sigmoid";
var TRAINING_STEPS_PER_FRAME = 1;
var TRACK_DIFFICULTY = 12; // doit rester égal à la valeur initiale de #diffSlider (index.html)
var TRACK_WIDTH = 100;
var TRACK_PRESET = "easy";
var currentTrackPreset = "easy";   // circuit réellement dessiné (peut différer de TRACK_PRESET : multi-circuits, course)
var MULTI_TRACK_TRAINING = false;  // true : chaque génération est évaluée sur plusieurs circuits
var MULTI_TRACK_SET = ["easy", "medium", "technical"]; // circuits d'entraînement (ordre fixe, voir MultiTrack.js)
var multiTrackRound = 0;           // indice du circuit en cours dans la génération (0 = premier)
var RACE_TRACK_CHOICE = "auto";    // circuit de la course : "auto" (= celui de l'entraînement) ou un nom de circuit
var trainingFinished = false;
var trainingActive = false;
var raceMode = false;
var raceFrames = 0;        // chronomètre de la course : images simulées depuis le départ
var RACE_FPS = 60;         // cadence nominale de p5 : 60 images simulées = 1 seconde de course
var showDebugSensors = false;
var trackEditorActive = false;
var trackEditorDraft = [];
var trackEditorPreviousState = null;
var generationStartedAt = 0;
var generationSpeedTotal = 0;
var generationSpeedSamples = 0;
var learningHistory = [];
var currentNetworkLeader = null;
