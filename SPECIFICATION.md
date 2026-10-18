# Neuro Racing — Spécification et plan de réalisation

**Projet :** apprentissage par neuroévolution de voitures autonomes
**Auteure :** Hajar Belhachmi — Master IA2, Université Côte d'Azur, 2026/2027
**Destinataire :** l'agent de développement chargé de réaliser le projet

> **Comment lire ce document.** Il décrit, dans l'ordre où elles doivent être exécutées, toutes les tâches nécessaires pour construire Neuro Racing de zéro. Chaque tâche est numérotée et porte un statut :
>
> - `[todo]` : à faire ;
> - `[done]` : terminée et vérifiée (critères d'acceptation remplis).
>
> **État actuel : les 61 tâches sont `[done]`.** Le projet est complet (dernière suite de tests exécutée : 246 tests, 246 réussis, 0 échec, 0 ignoré).
>
> **Note de méthode.** L'ordre et le découpage ont été reconstitués en lisant le code final, les tests et l'historique git (le projet est issu des exercices `9-VoitureSuitCircuit genetic algo` puis `9b - Voiture suit circuit version 2`). Ce n'est pas un journal horodaté : c'est la séquence logique la plus cohérente pour obtenir exactement le projet livré.

---

## Table des matières des tâches

| Phase | Tâches | Objet |
|---|---|---|
| 0. Cadrage et socle | 1 – 4 | Références, prototype, structure, page HTML |
| 1. Le monde | 5 – 11 | État global, géométrie, locomotion, circuits |
| 2. La perception | 12 – 13 | Rayons et vecteur d'entrées |
| 3. Le cerveau | 14 – 17 | Réseau de neurones, copie, mutation, sérialisation |
| 4. L'agent | 18 – 23 | Voiture, pilotage, règles de vie, progression |
| 5. L'évolution | 24 – 27 | Fitness, sélection, génération suivante, arrêt |
| 6. L'orchestration | 28 – 30 | Boucle p5, pas de simulation, leader, HUD |
| 7. La persistance | 31 – 32 | Archive locale, import/export |
| 8. L'interface | 33 – 40 | Réglages, courbe, diagramme, debug, course, éditeur |
| 9. La qualité | 41 – 46 | Tests automatisés |
| 10. La documentation | 47 – 48 | README, analyse, architecture, revue finale |
| 11. Évolutions | 49 – 61 | Chrono de course, réglages persistants, élitisme, croisement, collisions balayées, anti-toupie, éditeur robuste, graine aléatoire, multi-circuits, généralisation, archivage filtré, habillage visuel, son et effets |

---

## Exigences globales (valables pour toutes les tâches)

| Réf. | Exigence |
|---|---|
| G1 | Application 100 % navigateur : aucun serveur, aucune étape de compilation, aucun paquet à installer pour l'exécuter. |
| G2 | Scripts JavaScript classiques (pas de modules ES) chargés dans l'ordre de leurs dépendances. |
| G3 | Bibliothèques : p5.js 1.9.0 et TensorFlow.js 4.20.0 via CDN. |
| G4 | Le réseau ne produit que des **commandes** (direction, poussée) ; collisions, checkpoints et fin de tour sont des règles explicites. |
| G5 | Physique exprimée **par pas de simulation** (pas de `deltaTime`). |
| G6 | Toute donnée venant de l'extérieur (`localStorage`, fichier importé) est validée ; les erreurs sont signalées à l'utilisateur, jamais ignorées. |
| G7 | Tout cerveau TensorFlow abandonné est libéré avec `dispose()`. |
| G8 | Interface en français, accessible (libellés, `aria-*`, description du canvas). |
| G9 | Les règles de calcul importantes sont couvertes par des tests automatisés exécutables avec `node --test`. |
| G10 | Tout le hasard de la **simulation** (poids initiaux, mutation, croisement, tournoi, décalage de départ) passe par `Random.js` : jamais `Math.random()` ni `random()` de p5 dans la simulation, afin qu'une graine rejoue une expérience à l'identique (tâche 56). |
| G11 | Son et effets visuels sont du pur décor : ils ne modifient ni la simulation, ni la graine (leurs propres tirages sont locaux), ni l'apprentissage (tâche 61). |

---

# Phase 0 — Cadrage et socle

### Tâche 1 — Cadrer le sujet et les références `[done]`

**Objectif.** Fixer ce que le projet doit démontrer avant d'écrire du code.

**Travail réalisé.**
- Définir le sujet : une population de voitures apprend à parcourir un circuit fermé **sans trajectoire fournie ni règles de conduite codées à la main**.
- Choisir la méthode : **neuroévolution** (sélection par tournoi + mutation gaussienne), sans rétropropagation.
- Retenir la référence théorique de la locomotion : Craig W. Reynolds, *Steering Behaviors for Autonomous Characters* (GDC 1999) — séparation *sélection d'action → steering → locomotion*. Le PDF est placé dans `ARTICLE_CRAIG_REYNOLDS/`.
- Lister les huit objectifs fonctionnels : simulation visuelle, entrées mesurées (capteurs), réseau de décision, évolution des poids, évaluation par fitness, réglages et inspection, archivage/course comparative, circuits prédéfinis et éditeur.

**Critère d'acceptation.** Les objectifs sont énoncés et servent de base au README (tâche 47).

---

### Tâche 2 — Réaliser le prototype monolithique (exercice 9) `[done]`

**Objectif.** Valider l'idée avant de structurer le code.

**Travail réalisé.**
- Écrire un premier prototype dans `9-VoitureSuitCircuit genetic algo/` : `sketch.js`, `vehicle.js`, `nn.js`, `ga.js`, `ray.js`, `boundary.js`.
- Vérifier qu'une voiture peut mesurer des distances par rayons, décider avec un petit réseau et que la population évolue.
- Identifier les limites du prototype : un seul circuit, pas d'interface de réglage, pas de sauvegarde, code peu séparé, aucun test.

**Critère d'acceptation.** Le principe perception → réseau → mouvement → évolution est démontré ; la liste des limites devient le cahier des charges de la version 2.

---

### Tâche 3 — Créer la version 2 modulaire et la structure du dossier `[done]`

**Objectif.** Passer du prototype à une base maintenable (`9b - Voiture suit circuit version 2`, puis dossier `Conduite Évolutive`).

**Travail réalisé.**
- Découper en fichiers à responsabilité unique : `globals.js`, `utils.js`, `NeuralNetwork.js`, `BrainStorage.js`, `Ray.js`, `Track.js`, `Vehicle.js`, `Car.js`, `Genetic.js`, `main.js`.
- Créer les dossiers `css/` et `tests/`.
- Fichiers ajoutés ensuite, au fil des évolutions : `Settings.js` (tâche 50), `Random.js` (tâche 56), `MultiTrack.js` (tâche 57), `Generalization.js` (tâche 58), `Effects.js` et `Sound.js` (tâche 61).
- Initialiser le dépôt git, configurer VS Code Live Server sur le port 5503 (`.vscode/settings.json`).
- Isoler le projet dans son propre dépôt `Neuro_Racing` avec un dossier `Conduite Évolutive` pour l'application.

**Critère d'acceptation.** L'arborescence correspond à celle décrite dans `ARCHITECTURE.md` §2.

---

### Tâche 4 — Écrire `index.html` : squelette de page et ordre de chargement `[done]`

**Objectif.** Poser la structure DOM et le graphe de dépendances.

**Travail réalisé.**
- Charger p5.js 1.9.0 puis TensorFlow.js 4.20.0 depuis jsDelivr.
- Charger les scripts du projet dans cet ordre exact : `globals` → `utils` → `Random` → `NeuralNetwork` → `BrainStorage` → `Settings` → `Sound` → `Effects` → `Ray` → `Track` → `Vehicle` → `Car` → `Genetic` → `MultiTrack` → `Generalization` → `main`. `main.js` est en dernier car p5 cherche `setup()` et `draw()` globales. (À l'origine l'ordre était `globals → utils → NeuralNetwork → BrainStorage → Ray → Track → Vehicle → Car → Genetic → main` ; les scripts ajoutés par les tâches 50 à 61 ont été insérés avant les modules qui les utilisent.)
- Déclarer les zones d'interface (barre du haut avec le bouton de son, panneaux repliables, barre d'éditeur, panneau de réglages, bandeau de course, HUD, conteneur du canvas) avec leurs identifiants, sans logique.

**Critère d'acceptation.** La page se charge sans erreur de script ; chaque identifiant utilisé plus tard par `main.js` existe.

---

# Phase 1 — Le monde

### Tâche 5 — Définir l'état partagé dans `globals.js` `[done]`

**Objectif.** Centraliser constantes et paramètres de l'expérience.

**Travail réalisé.**
- Constantes de perception : `NB_ASSETS = 6` (5 rayons + vitesse), `SIGHT_DIST = 150`, `FOV = π/1.5` (120°).
- Paramètres initiaux : population 50, mutation 0,15, seuil de réussite 0,6, vitesse max 6, force 0,5, 20 neurones cachés, activation sigmoïde, 1 cycle par image, largeur de piste 100.
- Populations : `cars`, `savedCars`, `raceCars` ; monde : `walls`, `checkpoints`, `currentTrackPath`, etc.
- Ajouts ultérieurs : `CROSSOVER_RATE = 0,7`, `ELITE_COUNT = 1`, `TRACK_DIFFICULTY = 12` (égal au curseur de la page), `RANDOM_SEED` / `activeSeed`, `MULTI_TRACK_TRAINING` / `MULTI_TRACK_SET` / `multiTrackRound`, `RACE_TRACK_CHOICE`, `currentTrackPreset`, `raceFrames` / `RACE_FPS`, ainsi que `soundEngine`, `effects`, `trackLayer`, `currentOuterBoundary` et `currentScenery` pour le décor, le son et les effets.
- Drapeaux de mode : `trainingActive`, `trainingFinished`, `raceMode`, `trackEditorActive`, `showDebugSensors`.
- Utiliser `var` pour que les variables soient accessibles dans la portée globale **et** manipulables par les tests (`vm`).

**Critère d'acceptation.** Tous les modules suivants lisent leurs paramètres ici ; aucune « valeur magique » de réglage n'est dupliquée ailleurs.

---

### Tâche 6 — Écrire `utils.js` : distance point-segment `[done]`

**Objectif.** Fournir le calcul géométrique réutilisé par les collisions et les checkpoints.

**Travail réalisé.**
- `distPointToSegment(p, a, b)` : projection de `p` sur `[a, b]`, bornée à `[0, 1]`, puis distance au point projeté.
- Ne pas muter les vecteurs d'entrée (utilisation de `p5.Vector.sub` et de copies).

**Critère d'acceptation.** Un point au-delà d'une extrémité est mesuré par rapport à cette extrémité, pas à la droite infinie.

---

### Tâche 7 — Écrire `Vehicle.js` : la locomotion de base `[done]`

**Objectif.** Implémenter la couche « locomotion » de Reynolds.

**Travail réalisé.**
- Classe `Vehicle(position, velocity, maxSpeed, maxForce)` avec `pos`, `vel`, `acc` (copies des vecteurs reçus).
- `applyForce(f)` : accumule dans `acc`.
- `update()` : ne fait rien si `dead` ; sinon `vel += acc`, `vel.limit(maxSpeed)`, `pos += vel`, `acc = 0`.

**Critère d'acceptation.** Une force est intégrée **une seule fois** par pas et la vitesse ne dépasse jamais `maxSpeed` (vérifié par le test de la tâche 43).

---

### Tâche 8 — `Track.js` (1/3) : la ligne médiane du circuit `[done]`

**Objectif.** Produire un tracé fermé, régulier et lisse à partir de quelques points.

**Travail réalisé.**
- `interpolatePoints(points, résolution)` : spline de Catmull-Rom sur courbe fermée.
- `resamplePoints(points, espacement)` : rééchantillonnage à espacement constant (14 px) avec un **nombre entier de segments**, pour que la boucle se referme parfaitement.
- Circuits prédéfinis : 48 points sur une ellipse dont le rayon est modulé par des harmoniques — `easy` (cos 2θ), `medium` (cos 3θ), `technical` (cos 5θ + sin 3θ) ; l'amplitude dépend de `TRACK_DIFFICULTY`.
- Circuit personnalisé : interpolation (résolution 2) du tracé dessiné, puis rééchantillonnage.
- Repli sur `easy` si moins de 8 points sont produits.

**Critère d'acceptation.** Chaque preset donne une ligne médiane fermée d'au moins 8 points.

---

### Tâche 9 — `Track.js` (2/3) : bordures, murs, checkpoints, départ `[done]`

**Objectif.** Transformer la ligne médiane en obstacles mesurables.

**Travail réalisé.**
- Classe `Boundary(x1, y1, x2, y2, type)` (`"wall"` ou `"checkpoint"`), avec neutralisation des coordonnées `NaN`.
- Calculer la normale locale (tangente sur les points `i−2` et `i+2`) et décaler la ligne médiane de ±`TRACK_WIDTH/2` pour obtenir les bordures intérieure et extérieure.
- Mettre à l'échelle et centrer l'ensemble pour qu'il tienne dans le canvas (marge ≥ 36 px).
- Créer 2 murs par point de ligne médiane et **un checkpoint transversal tous les 4 points**.
- Calculer `TRACK_LENGTH` ; placer le départ à 5 % du tracé ; calculer `window.startAngle` et `window.startCheckpointIndex` (premier checkpoint à viser).

**Critère d'acceptation.** Murs et checkpoints sont fermés et restent dans les dimensions du canvas, même après redimensionnement (tâche 43).

---

### Tâche 10 — `Track.js` (3/3) : rendu de la piste et du décor `[done]`

**Objectif.** Rendre le circuit lisible.

**Travail réalisé.**
- `drawTrackSurface()` : herbe rayée, route en trois passes (bordure claire, bitume sombre, surface), pointillés centraux.
- `paintStartFinish()` : ligne d'arrivée en damier à deux rangées, emplacements de grille et portique.
- `paintInfield()` + `createLandscaping()` : herbe intérieure, arbres placés par `isInsidePolygon` à l'écart de la piste, étang au centre ; `createOuterScenery()` pose arbres, pins, buissons, rochers et fleurs hors piste (déterministe).
- `Boundary.show()` : murs alternant blanc/rouge, checkpoints en vert translucide (debug).

**Critère d'acceptation.** Le circuit est reconnaissable et les murs sont visibles ; le rendu n'altère ni la géométrie ni les collisions.

> *Rendu enrichi ensuite par la tâche 60 (calque mis en cache, vibreurs, gravier, décor extérieur, monoplaces).*

---

### Tâche 11 — Brancher la géométrie aux paramètres de circuit `[done]`

**Objectif.** Rendre largeur et complexité effectives.

**Travail réalisé.**
- `TRACK_WIDTH` pilote le décalage des bordures et l'épaisseur de la route.
- `TRACK_DIFFICULTY` module l'amplitude des harmoniques des presets.
- Les rayons de l'ellipse s'adaptent à la taille du canvas pour garder un circuit lisible sur tout écran.

**Critère d'acceptation.** Changer la largeur ou la complexité modifie réellement la géométrie générée (tâche 43).

---

# Phase 2 — La perception

### Tâche 12 — Écrire `Ray.js` : intersection rayon / segment `[done]`

**Objectif.** Fournir le capteur élémentaire.

**Travail réalisé.**
- Classe `Ray` : position, direction unitaire, `setPos`, `setDir`.
- `cast(wall)` : formule des déterminants ; renvoie le point d'impact seulement si l'impact est **sur le segment** (`0 < t < 1`) et **devant le rayon** (`u > 0`), sinon rien. Cas parallèle (`den = 0`) géré.
- `show()` : trait, point d'impact et distance en pixels, pour le mode debug.

**Critère d'acceptation.** Un mur derrière la voiture ou hors du segment n'est jamais détecté.

---

### Tâche 13 — Construire le vecteur d'entrées dans `Car.look()` `[done]`

**Objectif.** Transformer l'environnement en 6 nombres comparables.

**Travail réalisé.**
- Répartir **5 rayons** sur 120° autour du cap de la vitesse (`heading − FOV/2 + i·FOV/4`).
- Pour chaque rayon : impact le plus proche parmi tous les murs, distance bornée à 150 px.
- Normaliser : `entrée = map(distance, 0, 150, 1, 0)` (mur collé → 1, rien → 0).
- 6ᵉ entrée : `‖vel‖ / maxSpeed`.
- Mémoriser `end`, `distance` et `input` sur chaque rayon pour le debug.

**Critère d'acceptation.** Toutes les entrées sont dans `[0, 1]` ; la portée maximale et la vitesse normalisée sont vérifiées par test (tâche 43).

---

# Phase 3 — Le cerveau

### Tâche 14 — `NeuralNetwork.js` (1/4) : architecture et prédiction `[done]`

**Objectif.** Encapsuler un perceptron 6 → H → 2 dans TensorFlow.js.

**Travail réalisé.**
- `createModel()` : `tf.sequential` avec une couche dense cachée (activation configurable : sigmoïde, tanh, ReLU) et une couche de sortie dense de 2 neurones en sigmoïde.
- `predict(inputs)` : `tf.tidy` + `tensor2d` + `dataSync()`, renvoie un tableau JS.
- Nombre de paramètres : `9H + 2` (182 pour H = 20).

**Critère d'acceptation.** Une prédiction renvoie 2 valeurs dans `[0, 1]` et ne laisse aucun tenseur intermédiaire en mémoire.

---

### Tâche 15 — `NeuralNetwork.js` (2/4) : copie profonde `[done]`

**Objectif.** Permettre à un enfant de partir d'un parent sans le modifier.

**Travail réalisé.**
- `copy()` : nouveau modèle, poids **clonés**, tenseurs temporaires libérés dans un `finally`, modèle libéré si `setWeights` échoue.
- `dispose()` : libère le modèle.

**Critère d'acceptation.** Muter la copie ne change pas le parent (tâche 42).

---

### Tâche 16 — `NeuralNetwork.js` (3/4) : mutation gaussienne `[done]`

**Objectif.** Implémenter l'unique opérateur de variation.

**Travail réalisé.**
- `mutate(rate)` : pour chaque poids et chaque biais, avec la probabilité `rate` (`randomUnit()`), ajouter `randomGaussianValue(0, 0.1)` (`Random.js`, tâche 56).
- Reconstruire les tenseurs et les réinjecter avec `setWeights`, le tout dans `tf.tidy`.
- Pas de croisement à l'origine ; ajouté ensuite (`NeuralNetwork.crossover`, tâche 52).

**Critère d'acceptation.** Avec `rate = 1`, tous les poids sont perturbés ; avec `rate = 0`, aucun.

---

### Tâche 17 — `NeuralNetwork.js` (4/4) : sérialisation et validation `[done]`

**Objectif.** Rendre les cerveaux sauvegardables et sûrs à recharger.

**Travail réalisé.**
- `toJSON()` : `inputNodes`, `hiddenNodes`, `outputNodes`, `activation`, et 4 tenseurs (`shape` + `values`) dans l'ordre noyau caché, biais caché, noyau sortie, biais sortie.
- `fromJSON()` : valide, reconstruit, libère les tenseurs temporaires.
- `validateJSON()` : entiers ≥ 1, activation connue, exactement 4 tenseurs, **formes exactes**, tailles cohérentes, valeurs finies ; sinon erreur explicite.

**Critère d'acceptation.** Un JSON dont une forme ou une valeur est invalide est rejeté (tâche 42).

---

# Phase 4 — L'agent

### Tâche 18 — `Car.js` (1/5) : construction et état `[done]`

**Objectif.** Définir la voiture comme un `Vehicle` doté d'un cerveau.

**Travail réalisé.**
- `class Car extends Vehicle` ; constructeur acceptant : rien (réseau neuf), un `NeuralNetwork` (copié), ou `{ brain, position, color, name }` (cerveau objet ou JSON).
- Refuser un cerveau dont le nombre d'entrées ≠ 6 ou de sorties ≠ 2.
- Position de départ `(startX, startY)` ± 3 px ; cap initial `window.startAngle` ; checkpoint initial `window.startCheckpointIndex`.
- Initialiser les compteurs : `score`, `fitness`, `frameCount`, `framesStalled`, `framesMovingSlowly`, `framesSinceLastCheckpoint`, `wrongWayCount`, `trackProgress`, statistiques de vitesse, 5 instances de `Ray`.
- Cycle de 5 couleurs pour distinguer les voitures.

**Critère d'acceptation.** Un cerveau incompatible lève une erreur claire ; un cerveau JSON valide est restauré.

---

### Tâche 19 — `Car.js` (2/5) : pilotage `think()` `[done]`

**Objectif.** Convertir les sorties du réseau en force, selon le modèle de Reynolds.

**Travail réalisé.**
- `turnForce = map(sortie0, 0, 1, −maxForce, +maxForce)` ajouté au cap courant ; `thrust = map(sortie1, 0, 1, 0, maxSpeed)`.
- Aide au démarrage : pendant les 30 premiers pas, `thrust ≥ 0,5 · maxSpeed`.
- Vitesse désirée orientée au cap désiré et de norme `thrust` ; `steer = désirée − vitesse`, limité à `maxForce`, puis `applyForce(steer)`.
- Le réseau ne produit **jamais** de coordonnées.

**Critère d'acceptation.** La force appliquée ne dépasse jamais `maxForce` ; `setPhysics()` modifie les limites en direct (tâche 43).

---

### Tâche 20 — `Car.js` (3/5) : mise à jour et règles anti-blocage `[done]`

**Objectif.** Éliminer les voitures qui ne progressent pas, sans fausser l'apprentissage.

**Travail réalisé.**
- `update()` : incrémente `frameCount` ; **au pas 60**, élimine si la voiture est restée à moins de 40 px du départ ; appelle `super.update()` ; cumule la vitesse moyenne.
- Stagnation : fenêtres de 60 pas ; la fenêtre est « ratée » (`framesStalled += 60`) si le déplacement **net** est < 20 px (voiture sur place) **ou** si le chemin parcouru dépasse 60 px alors que le déplacement net est inférieur à 30 % de ce chemin (voiture qui tourne en rond, tâche 54) ; > 120 → mort ; une fenêtre réussie remet à zéro.
- Mort si > 1 200 pas sans checkpoint.
- Tous les seuils sont exprimés en pas de simulation (G5).

**Critère d'acceptation.** Une voiture immobile ou qui tourne en rond (y compris sur un grand cercle) est éliminée en quelques secondes simulées ; une voiture qui avance droit ou prend un virage serré normal ne l'est pas (tâche 54).

---

### Tâche 21 — `Car.js` (4/5) : checkpoints, sens inverse, tour complet `[done]`

**Objectif.** Matérialiser la progression et empêcher le contresens.

**Travail réalisé.**
- Sens inverse (à partir du pas 100, vitesse > 0,5) : comparer `vel` à la direction locale du circuit (centre du checkpoint visé → centre du suivant) ; produit scalaire < −0,3 → `wrongWayCount++` ; > 0,2 → −5 ; > 100 → mort.
- Validation : distance au segment du checkpoint visé < 40 px → `checkpointIndex` suivant, +50 points, compteurs remis à zéro.
- Quand l'index revient à 0 : +200, `finished = true`, `dead = true`.

**Critère d'acceptation.** Un tour complet donne `finished = true` ; une voiture à contresens est éliminée.

---

### Tâche 22 — `Car.js` (5/5) : rendu de la voiture `[done]`

**Objectif.** Afficher les agents de façon lisible.

**Travail réalisé.**
- `show(isBest, drawRays)` : rectangle 20×10 orienté selon la vitesse (c'est aussi l'emprise utilisée pour les collisions, tâche 53) ; dessiné à l'origine comme un simple rectangle avec pare-brise, il est devenu une monoplace dans la tâche 60.
- Voitures mortes masquées, sauf le leader (rouge translucide).
- Rayons dessinés uniquement en mode debug et pour le leader.
- Isolation du style par `push()` / `pop()`.

**Critère d'acceptation.** L'affichage n'influence aucun calcul.

---

### Tâche 23 — Collisions et progression sur le tracé (dans `main.js`) `[done]`

**Objectif.** Ajouter les règles du monde qui ne relèvent pas de la voiture seule.

**Travail réalisé.**
- `checkCollisions(car)` : mort si distance à un mur < `width / 1.8` (≈ 5,6 px) ou si la position sort du canvas. (Test d'origine sur la seule position ; rendu insensible à la vitesse par la collision balayée de la tâche 53.)
- `updateTrackProgress(car)` : trouver le point le plus proche de la ligne médiane, compter l'avance en nombre de points, ajouter la distance **uniquement si le mouvement est vers l'avant** et inférieur à la moitié du circuit ; décrémenter (jamais sous 0) en cas de recul.

**Critère d'acceptation.** La progression augmente en avançant et diminue en reculant (tâche 44).

---

# Phase 5 — L'évolution

### Tâche 24 — `Genetic.js` (1/4) : fonction de fitness `[done]`

**Objectif.** Distinguer une voiture qui avance vraiment d'une voiture qui tourne en rond.

**Travail réalisé.**
- `scoreCarFitness(car)` = score + 0,12 × progression plafonnée à la longueur du circuit + 8 × vitesse moyenne − 0,7 × `framesStalled` − 0,04 × (délai sans checkpoint − 120)⁺ − 0,35 × `wrongWayCount` + bonus de proximité du prochain checkpoint (jusqu'à 25).
- Distinguer le **score affiché** (checkpoints) de la **fitness de sélection**.
- `currentTrackLength()` avec repli de calcul si `TRACK_LENGTH` est invalide.

**Critère d'acceptation.** La progression et la vitesse augmentent la fitness ; stagnation, marche arrière et délais la diminuent (tâche 44).

---

### Tâche 25 — `Genetic.js` (2/4) : sélection par tournoi `[done]`

**Objectif.** Choisir les parents sans tri complet.

**Travail réalisé.**
- `tournamentSelection(population)` : tirer `min(5, taille)` individus au hasard (`randomIndex()`, avec remise) et garder celui de meilleure fitness ; population vide → `null`.

**Critère d'acceptation.** Une population vide ne plante pas ; le choix reste fortement orienté vers les meilleurs.

---

### Tâche 26 — `Genetic.js` (3/4) : génération suivante `[done]`

**Objectif.** Boucler l'évolution.

**Travail réalisé.**
- `nextGeneration()` : calculer les fitness, le taux de succès (voitures `finished` / population), enregistrer l'historique, archiver le top 3 (uniquement les voitures qui ont progressé, tâche 59).
- Sinon : pour `TOTAL_POP` enfants, `tournamentSelection` → copie du cerveau → `mutate(MUTATION_RATE)` → `setPhysics` ; libérer l'ancienne génération (G7). Si aucun parent, créer un cerveau neuf.
- Pas d'élitisme à l'origine ; ajouté ensuite (tâche 51).

**Critère d'acceptation.** La population garde la taille demandée et aucun tenseur de l'ancienne génération n'est conservé.

---

### Tâche 27 — `Genetic.js` (4/4) : arrêt sur réussite et archivage `[done]`

**Objectif.** Savoir quand arrêter et ne rien perdre.

**Travail réalisé.**
- Si `taux de succès ≥ SUCCESS_RATE_TARGET` : `trainingFinished = true`, `trainingActive = false`, message de réussite, la population évaluée est conservée.
- `archiveTopBrains(candidats, n)` : trier par fitness, créer un enregistrement (id unique, nom `G<gen> · …`, score, fitness, génération, piste, vitesse, force, cerveau JSON) et le sauvegarder ; erreur de sauvegarde signalée sans interrompre l'application.
- Reprise possible via « Continuer l'évolution » (tâche 34).

**Critère d'acceptation.** Après réussite, le bouton d'entraînement propose de continuer l'évolution (tâche 45).

---

# Phase 6 — L'orchestration

### Tâche 28 — `main.js` : `setup()` et `draw()` `[done]`

**Objectif.** Faire tourner l'application.

**Travail réalisé.**
- `setup()` : canvas plein écran dans `#canvas-container`, `describe()`, création du moteur de son et des effets (tâche 61), restauration des réglages (tâche 50), `setupTrack()`, liaison des contrôles et panneaux, chargement de l'archive, fixation de la graine (`beginExperimentSeed()`, tâche 56), puis création de la première population **après `tf.ready()`** ; erreur d'initialisation affichée.
- `draw()` : fond, simulation selon le mode (course / entraînement / éditeur), rendu de la scène, rafraîchissement espacé du diagramme (15 images) et du HUD (6 images).
- `windowResized()` : recalcule le circuit et redémarre l'entraînement.

**Critère d'acceptation.** L'application démarre, s'anime et réagit au redimensionnement.

---

### Tâche 29 — Pas de simulation et cycles par image `[done]`

**Objectif.** Découpler la vitesse d'apprentissage du rendu.

**Travail réalisé.**
- `simulateTrainingStep()` : pour chaque voiture, dans l'ordre : `think` → `update` → `updateTrackProgress` → `checkCheckpoints` → `checkCollisions` ; transfert vers `savedCars` à la mort (`handleCarDeath()` déclenche alors son et effets, tâche 61) ; `nextGeneration()` puis `generation++` quand `cars` est vide (le numéro n'avance pas après une réussite tant que l'entraînement n'a pas repris, tâche 59) ; en mode multi-circuits, `advanceMultiTrackRound()` s'intercale quand la dernière voiture d'un tour est hors course (tâche 57). Parcours à rebours pour pouvoir utiliser `splice`.
- `advanceTrainingFrame()` : répète le pas `TRAINING_STEPS_PER_FRAME` fois et **s'arrête immédiatement** si l'entraînement est mis en pause.

**Critère d'acceptation.** N cycles par image sont exécutés, et la pause interrompt la boucle en cours d'image (tâche 45).

---

### Tâche 30 — Leader, rendu de scène et HUD `[done]`

**Objectif.** Montrer qui mène et l'état de l'expérience.

**Travail réalisé.**
- `findTrainingLeader()` : un seul passage sans tri ; égalité départagée par la distance au prochain checkpoint ; repli sur `savedCars` si plus personne n'est vivant.
- `drawSceneEntities()` : murs, voitures, ligne bleue du leader vers son prochain checkpoint, brouillon de l'éditeur.
- `updateHud()` : mode, circuit, temps, vitesse moyenne, voitures en vie, score moyen/record, cycles par image ; reconstruit avec `createElement` / `textContent` (pas d'`innerHTML`).

**Critère d'acceptation.** Le HUD n'est pas reconstruit à chaque image (tâche 45).

---

# Phase 7 — La persistance

### Tâche 31 — `BrainStorage.js` : archive locale `[done]`

**Objectif.** Conserver les meilleurs cerveaux entre deux sessions.

**Travail réalisé.**
- Classe injectable `BrainStorage(storage = localStorage)` pour pouvoir la tester avec un faux stockage.
- Clé `neuroevolution-racing-brains-v1`, capacité **40**, plus récents en tête, remplacement des doublons d'`id`.
- `list()` est tolérant : il renvoie les entrées valides et ne modifie jamais l'archive (`isCorrupted()` signale les données abîmées). Avant toute écriture sur une archive abîmée (`repair()`, `save()`, `importJSON()`), sa **copie brute est sauvegardée** sous `neuroevolution-racing-brains-v1-corrupted-backup` (`getCorruptedBackup()`). Au démarrage, `loadBrainArchive()` répare et annonce ; `save()` et `importJSON()` ne sont jamais bloqués par une archive corrompue. `clear()` efface aussi la sauvegarde.
- Écriture unique `commit()` : `save()`, `importJSON()` et `repair()` n'écrivent jamais directement. `commit()` valide les entrées, relit et revalide le texte sérialisé, écrit, relit la valeur stockée et la compare ; en cas d'échec il restaure l'ancienne valeur et propage l'erreur. L'application ne peut donc plus produire elle-même d'archive invalide ni à moitié écrite.
- `validateRecord()` : `id` et `name` en chaîne, `score` fini, cerveau valide.
- `clear()`.

**Critère d'acceptation.** Sauvegarde, plafonnement à 40 et effacement fonctionnent ; une archive corrompue est signalée (tâche 42).

---

### Tâche 32 — Import et export JSON `[done]`

**Objectif.** Sauvegarder et transférer des cerveaux hors du navigateur.

**Travail réalisé.**
- `exportJSON()` : `{ format: "neuroevolution-brains", version: 1, brains: [...] }`.
- `importJSON(texte)` : refuse un JSON invalide ou un autre format, valide tous les enregistrements, fusionne avec l'archive, dédoublonne par `id`, respecte la limite de 40 ; si l'archive locale est corrompue, ne plante pas, sauvegarde la copie brute de l'archive abîmée et conserve ses entrées valides.
- Côté interface : téléchargement `neuroevolution-cerveaux.json` (Blob + lien temporaire), import par sélecteur de fichier, messages d'erreur clairs.

**Critère d'acceptation.** Un export réimporté redonne les mêmes cerveaux sans doublon.

---

# Phase 8 — L'interface

### Tâche 33 — Panneau de réglages et liaison des curseurs `[done]`

**Objectif.** Rendre l'expérience paramétrable en direct.

**Travail réalisé.**
- `bindRange()` : met l'affichage à jour pendant le glissement et déclenche l'action soit à chaque mouvement (`input`), soit au relâchement (`change`) pour les actions coûteuses.
- Réglages **immédiats** : vitesse max, force, cycles par image, mutation, seuil de réussite, debug.
- Réglages **avec redémarrage** : neurones cachés, population, activation, circuit, complexité, largeur.
- `updatePhysics()` répercute vitesse et force sur les voitures déjà créées.

**Critère d'acceptation.** Chaque contrôle agit comme décrit dans le tableau §11.2 de `ARCHITECTURE.md`.

---

### Tâche 34 — Contrôle d'entraînement : pause, reprise, redémarrage, continuation `[done]`

**Objectif.** Gérer proprement le cycle de vie de l'expérience.

**Travail réalisé.**
- `toggleTraining()` / `updateTrainingButton()` : « Pause », « Reprendre » ou « Continuer l'évolution » selon l'état.
- `continueTrainingFromArchive()` : nouvelle génération à partir de la population évaluée, avec le taux de mutation courant.
- `restartTraining(message)` : point de réinitialisation unique — quitte la course, **archive le top 5** (uniquement les voitures qui ont progressé, tâche 59) avant de tout perdre, remet `multiTrackRound` à 0 et réapplique la graine, libère les cerveaux, recrée la population, remet à zéro génération, historique et affichages.
- `saveCurrentTop()` : archive manuelle des 5 meilleurs.

**Critère d'acceptation.** Changer l'architecture ou le circuit ne perd aucun bon cerveau (ils sont archivés d'abord).

---

### Tâche 35 — Courbe d'apprentissage `[done]`

**Objectif.** Visualiser la progression par génération.

**Travail réalisé.**
- `recordGenerationResult()` : moyenne, meilleur score, vitesse moyenne, durée ; historique limité à **250 générations**.
- `drawLearningChart()` : `<canvas>` 2D, deux courbes (score moyen en bleu, meilleur en jaune), graduations, générations de début et de fin.
- Panneau repliable : rendu **uniquement s'il est ouvert**.
- Export CSV pour le rapport : `learningHistoryToCsv()` (une ligne par génération : `generation`, `score_moyen`, `meilleur_score`, `vitesse_moyenne`, `duree_s` ; virgule, point décimal, CRLF) et `exportLearningCurve()` (téléchargement `courbe-apprentissage-<circuit>.csv`). Bouton `#exportLearningCsv` désactivé tant que l'historique est vide (`updateLearningExportButton()`).

**Critère d'acceptation.** Les données sont mises en forme pour les deux séries ; un panneau fermé ne dessine rien (tâche 44) ; l'export CSV reproduit exactement l'historique (`learning-export.test.cjs`, 6 tests).

---

### Tâche 36 — Diagramme du réseau du meilleur agent `[done]`

**Objectif.** Rendre les poids inspectables.

**Travail réalisé.**
- `updateNetworkDiagram()` : SVG généré en JS à partir de `toJSON()` ; trois colonnes de nœuds, une ligne par poids ; **vert** = positif, **rouge** = négatif ; épaisseur et opacité proportionnelles à `|w| / max|w|`.
- Info-bulle au survol : libellé du neurone et biais, ou valeur du poids de la connexion.
- Reconstruction seulement si le leader a changé (ou sur demande), et seulement si le panneau est ouvert.

**Critère d'acceptation.** Le diagramme reflète l'architecture 6–H–2 courante.

---

### Tâche 37 — Mode debug des capteurs `[done]`

**Objectif.** Comprendre ce que voit l'agent.

**Travail réalisé.**
- Case « Debug des capteurs et distances » : affiche checkpoints numérotés, rayons du leader, points d'impact et distances en pixels, ligne vers le prochain checkpoint, distances dans le HUD.
- Aucun effet sur les entrées, les poids ou la décision.

**Critère d'acceptation.** Activer ou désactiver le debug ne change pas le résultat de l'apprentissage.

---

### Tâche 38 — Course comparative des cerveaux archivés `[done]`

**Objectif.** Comparer plusieurs réseaux sur le même circuit.

**Travail réalisé.**
- Liste cochable des cerveaux (`renderBrainList`), « Tout sélectionner », bouton « Lancer la course » activé seulement si au moins un cerveau est coché.
- `startBrainRace()` : une `Car` par cerveau (restauré depuis son JSON), même point de départ, couleurs distinctes ; sauvegarde de l'état d'entraînement ; bandeau « COURSE DES CERVEAUX ».
- `simulateRaceFrame()` : **un pas par image**, sans faire avancer les générations.
- `getRaceLeader()` : priorité à l'arrivée, puis score, puis proximité du checkpoint visé ; `displayRaceResults()` affiche le top 6.
- `exitBrainRace()` : libère les voitures de course et restaure l'état d'avant.

**Critère d'acceptation.** Une course ne change pas la génération d'entraînement (tâche 45).

---

### Tâche 39 — Éditeur de circuit à la souris `[done]`

**Objectif.** Étudier l'effet de la géométrie sur l'apprentissage.

**Travail réalisé.**
- `beginTrackEditor()` : met l'entraînement en pause, mémorise l'état, affiche la barre d'édition.
- `mousePressed` / `mouseDragged` → `addTrackDraftPoint()` : ignore les points hors canvas et ceux à moins de 7 px du précédent.
- `drawTrackEditorDraft()` : aperçu de la route avec la largeur réelle.
- `finishTrackEditor()` : referme d'abord proprement un trait qui dépasse son point de départ (`closeDraftLoop`, tâche 55), puis refuse un tracé qui se recoupe (`findLoopSelfIntersection`) ou de moins de 16 points ou d'aire inférieure à 1,5 % du canvas ; sinon enregistre `customTrackPath`, passe en preset `custom`, reconstruit la piste, redémarre (ou, en mode multi-circuits, conserve l'entraînement en cours et sélectionne le circuit dessiné pour la course, tâche 57).
- `cancelTrackEditor()` : restaure l'état précédent ; `resetTrackEditor()` : retour au circuit débutant après confirmation.
- Choisir « Mon circuit dessiné » sans tracé ouvre directement l'éditeur.

**Critère d'acceptation.** Un tracé dessiné devient un circuit fermé avec checkpoints (tâche 43).

---

### Tâche 40 — Style, responsive et accessibilité `[done]`

**Objectif.** Une interface lisible et utilisable partout.

**Travail réalisé.**
- `style.css` : thème sombre par variables CSS, canvas plein écran, panneaux flottants (réglages, courbe, réseau), HUD, bandeau de course, états `hidden`, bouton « danger ».
- Adaptation aux écrans étroits (`@media (max-width: 600px)`).
- Accessibilité : `aria-expanded` / `aria-controls` sur les panneaux, `aria-live` sur HUD et messages, `<label for>` sur chaque curseur, `aria-label` sur le graphique et le diagramme, focus visible, `describe()` sur le canvas.
- Confirmations (`window.confirm`) avant les actions destructrices (effacer l'archive, réinitialiser l'éditeur).

**Critère d'acceptation.** Tous les contrôles sont utilisables au clavier et compréhensibles sans la couleur seule.

---

# Phase 9 — La qualité

### Tâche 41 — Dispositif de test : `tests/helpers.cjs` `[done]`

**Objectif.** Tester les **vraies** sources sans navigateur ni bundler.

**Travail réalisé.**
- `createContext()` : contexte `node:vm` avec un adaptateur `TestVector` (add, sub, mult, dot, limit, heading, `fromAngle`…) et des substituts de l'API p5 (`createVector`, `map`, `constrain`, `dist`, `lerp`, `random`, `width`, `height`, `window`).
- `loadScripts(contexte, fichiers, noms)` : concatène les vrais fichiers de `js/` et expose les symboles demandés.
- Exécution avec `node --test` (aucune dépendance npm).

**Critère d'acceptation.** Les tests exécutent le code de production, pas une copie.

---

### Tâche 42 — Tests de persistance et du réseau : `brain-storage.test.cjs` (25 tests) `[done]`

**Objectif.** Garantir la fiabilité des cerveaux et de l'archive.

**Travail réalisé.**
- Construction, copie, mutation (aléatoire rendu déterministe par injection) et restauration d'un réseau, avec faux `tf`.
- Validation de toutes les formes et valeurs.
- Sauvegarde, plafond de 40, export/import avec faux stockage.
- Archive malformée : erreur signalée.
- Effacement de l'archive.
- Écriture unique `commit()` (tâche 31) : toutes les architectures de l'interface, poids non finis refusés, quota dépassé, écriture tronquée annulée, sauvegarde de l'archive corrompue.

*Le fichier comptait 5 tests à l'origine ; il en compte 25 après le durcissement de `BrainStorage` (`commit()`, `repair()`, copie de sauvegarde).*

**Critère d'acceptation.** 25 tests réussis.

---

### Tâche 43 — Tests de géométrie et de pilotage : `vehicle-track.test.cjs` (7 tests) `[done]`

**Objectif.** Garantir la physique et les circuits.

**Travail réalisé.**
- `Vehicle` : une force intégrée une fois, vitesse limitée.
- Les trois presets : bordures fermées et checkpoints mesurables.
- Géométrie contenue dans le canvas après redimensionnement.
- Effet de la largeur et de la complexité.
- Circuit dessiné → piste fermée avec checkpoints.
- Entrées des rayons : portée maximale et vitesse normalisée.
- Force de pilotage et limites `maxSpeed` / `maxForce` modifiables en direct.

**Critère d'acceptation.** 7 tests réussis.

---

### Tâche 44 — Tests de fitness et de progression : `fitness-progress.test.cjs` (6 tests) `[done]`

**Objectif.** Garantir que l'évaluation récompense bien ce qu'on veut.

**Travail réalisé.**
- Progression sur la ligne médiane et vitesse récompensées.
- Pénalités : stagnation, marche arrière, délai sans checkpoint.
- Progression en avant / diminution en arrière.
- Données de la courbe et durée lisible.
- Leader trouvé en un passage, sans tri.
- Panneaux fermés : aucun travail de rendu.

**Critère d'acceptation.** 6 tests réussis.

---

### Tâche 45 — Tests de boucle d'entraînement et de course : `training-speed.test.cjs` (6 tests) `[done]`

**Objectif.** Garantir l'orchestration.

**Travail réalisé.**
- Nombre de cycles par image respecté.
- HUD à fréquence limitée.
- Pause prise en compte au milieu d'une image.
- Course sans avancée des générations.
- Priorité du leader de course : arrivée, score, proximité.
- Bouton « Continuer l'évolution » après le seuil de réussite.

**Critère d'acceptation.** 6 tests réussis.

---

### Tâche 46 — Exécution finale de la suite et correction des régressions `[done]`

**Objectif.** Ne livrer qu'un projet validé.

**Travail réalisé.**
- Lancer `node --test tests/*.test.cjs` depuis `Conduite Évolutive/` après la dernière modification.
- Corriger toute régression avant livraison.
- Consigner le résultat : **246 tests dans 23 fichiers, 246 réussis, 0 échec, 0 ignoré** (24 tests dans 4 fichiers à la première livraison ; la suite a grandi avec les tâches 49 à 61).
- Rappeler les limites : les tests utilisent des adaptateurs et ne remplacent pas une validation visuelle en navigateur ni la mesure de la qualité d'apprentissage.

**Critère d'acceptation.** Suite entièrement verte.

---

# Phase 10 — La documentation

### Tâche 47 — Rédiger le README (rapport de projet) `[done]`

**Objectif.** Permettre à un lecteur de comprendre, lancer et expérimenter.

**Travail réalisé.**
- Résumé, introduction, objectifs, description générale, technologies et justifications.
- Explication de la perception, du réseau, de l'entraînement et des règles d'élimination.
- Tableau de tous les réglages (plages et valeurs initiales).
- Circuits, éditeur, suivi des résultats, archivage, course, lancement par serveur HTTP local, tests et limites.
- Formulation prudente : aucun taux de réussite ni temps de convergence n'est revendiqué sans mesure.

**Critère d'acceptation.** Chaque affirmation du README correspond au comportement du code.

---

### Tâche 48 — Rédiger `analyse.md`, `ARCHITECTURE.md`, `SPECIFICATION.md` et faire la revue finale `[done]`

**Objectif.** Documenter l'analyse, la structure et le plan, puis vérifier la cohérence d'ensemble.

**Travail réalisé.**
- `analyse.md` : analyse fonctionnelle et technique, fitness, protocole d'expérimentation, limites, pistes d'évolution.
- `ARCHITECTURE.md` : organisation du code, flux de données, formats JSON, conventions, extensions, points d'attention.
- `SPECIFICATION.md` (ce document) : plan de réalisation en tâches numérotées.
- Revue finale : relire le code face aux documents, relever les écarts connus (valeur initiale de `TRACK_DIFFICULTY` à 5 contre 12 affiché ; fonctions non utilisées ; titre « 9b » hérité) et les consigner. Ces trois écarts sont corrigés depuis (voir `ARCHITECTURE.md` §15) ; `AGENTS.md` et l'`ARCHITECTURE.md` placés à la racine du dépôt décrivent un autre projet (exercices de *steering behaviors*) et ne sont pas à jour pour Neuro Racing.

**Critère d'acceptation.** Documents, code et tests sont cohérents entre eux ; les écarts connus sont listés et non masqués.

---

# Phase 11 — Évolutions

### Tâche 49 — Chronomètre et classement au temps de tour dans la course comparative `[done]`

**Objectif.** Pouvoir départager des cerveaux archivés sur un critère objectif : le temps mis pour finir le tour.

**Travail réalisé.**
- `globals.js` : `raceFrames` (images simulées depuis le départ) et `RACE_FPS = 60`.
- `Car.js` : `lapFrames` enregistre `frameCount` au franchissement de l'arrivée (`null` tant que la voiture n'a pas fini).
- `main.js` : `simulateRaceFrame()` fait avancer le chronomètre tant qu'une voiture roule ; `formatRaceTime()` l'affiche au centième (`0:01.38`) ; `rankRaceCars()` classe les arrivées au temps croissant (même temps = même rang), puis les autres par score et proximité du prochain checkpoint ; `getRaceLeader()` privilégie l'arrivée la plus rapide ; `refreshRaceTimer()` et `refreshRaceRanking()` mettent à jour l'affichage ; `displayRaceResults()` indique le temps d'arrivée. Le HUD « Temps de course » utilise désormais ce chronomètre (il mesurait auparavant le temps écoulé depuis le début de la génération d'entraînement).
- `index.html` / `style.css` : le bandeau de course contient le chronomètre (`#raceTimer`, `role="timer"`) et le classement (`#raceRanking`, 8 lignes, écart au premier, état « en piste » / « sortie »), réduit à 3 lignes sur petit écran.
- `tests/race-timing.test.cjs` : 9 tests.

**Critère d'acceptation.** En course, le chronomètre avance jusqu'à la sortie ou l'arrivée de la dernière voiture ; le classement place les arrivées par temps de tour croissant avec leur écart au premier ; les voitures sorties apparaissent après les arrivées ; la suite de tests reste verte.

---

### Tâche 50 — Réglages conservés entre les sessions `[done]`

**Objectif.** Ne pas avoir à reconfigurer la simulation à chaque rechargement de la page.

**Travail réalisé.**
- `Settings.js` (nouveau, chargé après `BrainStorage.js`) : table `SETTING_DEFINITIONS` (contrôle HTML, variable globale, format d'affichage) pour la vitesse, la force, les cycles par image, la population, la mutation, le seuil de réussite, les neurones cachés, l'activation, le circuit prédéfini, la complexité, la largeur et le debug (puis, avec les tâches 52, 56 et 57 : taux de croisement, graine, entraînement multi-circuits avec ses trois cases, circuit de la course).
- `SettingsStorage` : lecture tolérante (absent, JSON illisible, mauvais format, stockage bloqué → aucun réglage) et écriture fusionnée sous la clé `neuroevolution-racing-settings-v1`, sans exception si le quota ou le mode privé la refuse.
- `restoreSettings()` : valide chaque valeur (bornes, pas et options lus dans `index.html`), applique les variables globales et met à jour curseurs et affichages, **avant** `setupTrack()` et la création des voitures ; aucun redémarrage d'entraînement n'est déclenché.
- `main.js` : un écouteur `change` sur le panneau de réglages appelle `persistSettings()` après la mise à jour de chaque variable.
- Le circuit dessiné n'est pas conservé : le dernier circuit prédéfini reste mémorisé. Pause et panneaux repliés ne sont pas mémorisés.
- `tests/settings-storage.test.cjs` : 6 tests.

**Critère d'acceptation.** Après modification des réglages et rechargement, curseurs, affichages et variables retrouvent leurs valeurs ; une valeur invalide est ignorée ; un stockage indisponible ne bloque pas l'application ; la suite de tests reste verte.

---

### Tâche 51 — Élitisme : conserver le meilleur cerveau `[done]`

**Objectif.** Empêcher la progression de reculer : sans élitisme, même le meilleur cerveau était muté à chaque génération.

**Travail réalisé.**
- `globals.js` : `ELITE_COUNT = 1` (nombre de meilleurs cerveaux reconduits sans mutation).
- `Genetic.js` : `buildNextPopulation(previousGeneration)` place d'abord les élites (`findEliteParents`, classées par fitness, repli sur le score si la fitness n'est pas finie), puis complète avec tournoi + mutation jusqu'à `TOTAL_POP`. L'élite est copiée avec son cerveau et son `startPos` : le départ de chaque voiture est décalé au hasard de ±3 px, la rejouer au même point reproduit exactement son tour. Le nombre d'élites est borné par `TOTAL_POP` et par la taille de la génération précédente.
- `nextGeneration()` et `continueTrainingFromArchive()` (`main.js`) utilisent toutes deux `buildNextPopulation()` : les deux chemins de création d'une génération restent cohérents.
- `tests/elitism.test.cjs` : 8 tests.

**Critère d'acceptation.** Le meilleur cerveau figure sans mutation dans la génération suivante, à la première place ; la population garde la taille demandée ; une génération précédente vide ne plante pas ; l'ancienne génération est libérée après les copies ; la suite de tests reste verte.

---

### Tâche 52 — Croisement entre deux parents, en plus de la mutation `[done]`

**Objectif.** Combiner deux bons cerveaux au lieu de seulement muter la copie d'un seul parent.

**Travail réalisé.**
- `NeuralNetwork.crossover(parentA, parentB)` : croisement **par neurone caché** — chaque neurone (poids d'entrée, biais, poids de sortie) est hérité d'un seul parent tiré à pile ou face ; le biais de chaque sortie est tiré séparément. Les parents ne sont pas modifiés ; architectures différentes → copie du premier parent. Fait dans `tf.tidy`.
- `Genetic.js` : `createChild()` — avec la probabilité `CROSSOVER_RATE` (70 %, `globals.js`), second parent distinct du premier tiré par un autre tournoi ; sinon copie d'un seul parent ; population réduite à un parent ou vide gérée. Le cerveau croisé intermédiaire est libéré (`dispose`) car `Car` en garde sa propre copie. La mutation est appliquée ensuite ; les élites ne sont jamais croisées.
- Curseur **Taux de croisement** (`#crossoverSlider`, 0–100 %, pas de 5) lié dans `bindControls`, sans redémarrage de l'entraînement, et conservé entre les sessions (`Settings.js`).
- `tests/crossover.test.cjs` : 10 tests ; `settings-storage.test.cjs` et `elitism.test.cjs` adaptés.

**Critère d'acceptation.** Un enfant croisé hérite chaque neurone d'un seul parent, ses parents restent intacts ; avec un taux de 0 aucun croisement n'a lieu ; le cerveau intermédiaire est libéré ; la population garde la taille demandée ; la suite de tests reste verte.

### Tâche 53 — Collision balayée et emprise réelle de la voiture `[done]`

**Objectif.** Empêcher une voiture rapide de « traverser » un mur entre deux pas, et faire collisionner la voiture avec sa forme dessinée plutôt qu'avec un point.

**Travail réalisé.**
- `Car.js` : `update()` mémorise `lastStepPos` (position avant `super.update()`).
- `utils.js` : `distSegmentToSegment(p1, p2, q1, q2)` (0 si les segments se croisent, sinon l'écart minimal) et `segmentHitsOrientedRect(a, b, center, heading, halfLength, halfWidth)` (segment contre rectangle orienté).
- `main.js` — `checkCollisions(car)` : mort si le **trajet du pas** (`lastStepPos → pos`) passe à moins de `width / 1.8` d'un mur, **ou** si le **rectangle de la voiture** (20 × 10, orienté selon la vitesse, comme dessiné) touche un mur à sa position d'arrivée ; repli sur le test de position si `lastStepPos` n'existe pas.

**Critère d'acceptation.** Une voiture rapide qui saute un mur en un pas est éliminée, une voiture qui ne croise aucun mur survit ; le nez du véhicule touche un mur que le centre n'atteint pas, un mur juste au-delà du nez n'est pas touché ; le rectangle suit le cap (`tunneling.test.cjs`, 6 tests ; `car-rectangle.test.cjs`, 5 tests).

---

### Tâche 54 — Détecter les voitures qui tournent en rond (anti-toupie) `[done]`

**Objectif.** Éliminer une voiture qui tourne en cercle sans avancer, y compris sur un grand cercle que l'ancien test (« moins de 20 px parcourus ») laissait passer.

**Travail réalisé.**
- `Car.js` : `windowPath` cumule la vitesse sur chaque fenêtre de 60 pas ; à la fin de la fenêtre, le déplacement net (`pos` contre `prevPos`) est comparé au chemin parcouru. Fenêtre ratée si `netMoved < 20` (sur place) **ou** si `windowPath > 60` et `netMoved < 0,3 × windowPath` (rotation).
- Les compteurs `framesStalled` et les seuils de la tâche 20 restent inchangés.

**Critère d'acceptation.** Une voiture sur un grand cercle ou immobile est éliminée ; une voiture qui avance droit ou prend un virage serré normal ne l'est pas (`stall-and-editor.test.cjs`, tests de stagnation).

---

### Tâche 55 — Éditeur de circuit : clics hors canvas et boucle qui dépasse `[done]`

**Objectif.** Rendre le dessin à la souris tolérant sans accepter un tracé invalide.

**Travail réalisé.**
- `main.js` : `isCanvasEvent()` — `mousePressed` / `mouseDragged` ignorent les clics qui ne visent pas le canvas (boutons de la barre d'éditeur, panneaux).
- `Track.js` : `doSegmentsIntersect`, `findLoopSelfIntersection(points)`, `segmentIntersectionPoint` et `closeDraftLoop(points)` : quand le trait dépasse un peu son point de départ, le petit bout en trop est coupé et la boucle est refermée sur le point de croisement ; un croisement au milieu du circuit (boucle en « 8 ») n'est **pas** corrigé et reste refusé.
- `finishTrackEditor()` applique `closeDraftLoop` avant ses validations (voir tâche 39) et teste le croisement **avant** l'aire (l'aire signée d'un « 8 » s'annule).

**Critère d'acceptation.** Une boucle simple n'a pas d'auto-intersection, un « 8 » est détecté, un tracé qui se recoupe est refusé en gardant l'éditeur ouvert, un tracé valide est accepté, un dépassement est refermé et le circuit se construit avec murs et checkpoints (`track-intersection.test.cjs`, 4 tests ; `stall-and-editor.test.cjs`, tests de l'éditeur ; au total 13 tests avec la tâche 54).

---

### Tâche 56 — Hasard à graine : expériences reproductibles `[done]`

**Objectif.** Pouvoir rejouer une expérience à l'identique et comparer deux réglages sur le même point de départ.

**Travail réalisé.**
- `Random.js` (nouveau, chargé après `utils.js`) : générateur mulberry32 (`SeededRandom`), `parseSeed()` (entier de 0 à 2³² − 1, sinon `null`), `drawRandomSeed()`, `seedRandom()`, `randomUnit()`, `randomBetween()`, `randomIndex()`, `randomGaussianValue()` (Box-Muller) et `nextInitSeed()` (graines des initialiseurs `glorotUniform` de TensorFlow.js, donc poids initiaux). Sans graine fixée, ces fonctions délèguent au hasard historique, ce qui laisse les tests existants valides.
- Branchement dans `NeuralNetwork` (mutation, croisement, initialiseurs), `Genetic` (tournoi, choix du croisement) et `Car` (décalage de départ). `copy()` et `fromJSON()` n'initialisent pas depuis le flux (`NO_INIT_SEEDS`), pour qu'une course ou un respawn ne décale pas la suite de l'entraînement.
- `main.js` : `beginExperimentSeed()` (au démarrage et dans `restartTraining()`, pas dans « Continuer l'évolution », la pause ou la course), `applySeedFromInput()` (une graine valide relance l'expérience ; champ vide = graine automatique ; valeur invalide refusée avec message), `replaySeed()` (bouton « Rejouer »), `updateSeedDisplay()` (HUD et `#seedUsed`) ; la graine figure dans le nom du CSV.
- `index.html` : champ `#seedInput`, bouton `#replaySeedButton`, `#seedUsed`, `#seedHint` ; la graine est un réglage conservé (tâche 50).

**Critère d'acceptation.** Valeurs de référence de mulberry32, bornes et loi des tirages vérifiées ; mutation, croisement, tournoi et départ de la vraie `Car` rejoués à l'identique ; une expérience complète se rejoue exactement ; `copy()` / `fromJSON()` ne consomment pas le flux (`random-seed.test.cjs`, 36 tests).

---

### Tâche 57 — Entraînement sur plusieurs circuits `[done]`

**Objectif.** Éviter qu'un cerveau n'apprenne à conduire que sur un seul tracé.

**Travail réalisé.**
- `globals.js` : `MULTI_TRACK_TRAINING`, `MULTI_TRACK_SET` (ordre fixe débutant → intermédiaire → expert), `multiTrackRound`, `currentTrackPreset`.
- `Track.js` : `trainingPreset()` (circuit sur lequel l'entraînement tourne : celui du tour en cours en multi-circuits) et `setupTrack(preset = trainingPreset())`, qui construit n'importe quel circuit sans modifier `TRACK_PRESET`.
- `MultiTrack.js` (nouveau) : `selectTrackPreset()` (au moins un circuit reste coché), `trackStartOffset()`, `summarizeRound()`, `aggregateRounds()` (moyenne des tours ; `finished` = a bouclé **tous** les circuits), `respawnOnCurrentTrack()` (même cerveau, même décalage de départ, même couleur et nom, ancienne voiture libérée), `applyAggregatedResults()`, `advanceMultiTrackRound()`, `beginMultiTrackGeneration()`. `aggregateFitness` empêche `calculateFitness()` de recalculer la fitness sur le seul dernier circuit.
- Interface : case `#multiTrackToggle` et trois cases `#multiTrack-easy|medium|technical` ; réglages conservés et corrigés à la relecture si aucun circuit ne reste coché (tâche 50).

**Critère d'acceptation.** Une génération se déroule en un tour par circuit coché ; score et fitness sont la moyenne des tours ; une voiture qui ne réussit qu'un circuit ne domine pas la sélection ; `setupTrack(preset)` ne touche pas au réglage du circuit ; les réglages multi-circuits survivent à un rechargement (`multi-track.test.cjs`, 14 tests ; `track-preset-param.test.cjs`, 6 tests ; `multi-track-settings.test.cjs`, 9 tests).

---

### Tâche 58 — Course sur un autre circuit : connu ou inédit `[done]`

**Objectif.** Mesurer la généralisation : un cerveau sait-il conduire sur un circuit qu'il n'a jamais vu ?

**Travail réalisé.**
- `archiveTopBrains()` enregistre dans chaque cerveau `trackPreset` (`"multi"` en multi-circuits) et `trainedOn` (liste des circuits d'entraînement, champ facultatif pour rester compatible avec les anciennes archives).
- `Generalization.js` (nouveau) : `presetLabel()`, `trainedOnPresets()` (ignore les valeurs inconnues, repli sur `trackPreset`), `circuitStatus()` (`seen` / `unseen` / `unknown`), `describeTrainedOn()`, `raceTrackPreset()`, `summarizeGeneralization()`, `formatGeneralization()` et `describeRaceTrack()`.
- `main.js` : sélecteur `#raceTrackSelect` (`RACE_TRACK_CHOICE` : `"auto"` ou un circuit), `chooseRaceTrack()` ; `startBrainRace()` redessine le circuit de la course seulement s'il diffère du circuit courant, `exitBrainRace()` rétablit `trainingPreset()` ; chaque voiture de course reçoit `trainedOn` et `circuitStatus` ; `displayRaceResults()` affiche le bilan « circuit inédit : x/y ont bouclé le tour · circuit déjà vu : … » ; `#raceTrackInfo` décrit le circuit dans le bandeau.

**Critère d'acceptation.** Un cerveau ancien sans historique n'obtient ni « connu » ni « inédit » ; une course sur un autre circuit le dessine, étiquette chaque cerveau, puis rétablit le circuit d'entraînement à la sortie ; la course par défaut ne redessine rien ; une course sur un circuit dessiné qui n'existe pas encore est refusée sans effet de bord ; le classement indique « connu » / « inédit » en toutes lettres, pas seulement par la couleur ; la ligne de généralisation n'apparaît que si les historiques sont connus (`generalization.test.cjs`, 16 tests).

---

### Tâche 59 — Archivage filtré, compteur de génération et valeurs par défaut `[done]`

**Objectif.** Ne pas polluer l'archive et garder des compteurs et des défauts cohérents.

**Travail réalisé.**
- `Genetic.js` : `hasArchivableProgress(car)` et option `archiveTopBrains(liste, n, { onlyProgressed })`. Les archivages **automatiques** (top 3 de `nextGeneration`, top 5 de `restartTraining`) ignorent les voitures sans checkpoint validé et non terminées ; l'archivage **manuel** (`saveCurrentTop`) enregistre tout ce qui est demandé.
- `main.js` : le numéro de génération n'avance que lorsqu'une nouvelle génération commence ; après une réussite il reste le même jusqu'à « Continuer l'évolution » (qui incrémente à la reprise).
- `globals.js` / `index.html` : `TRACK_DIFFICULTY` vaut 12, comme le curseur `#diffSlider` (le test détecte toute divergence future).

**Critère d'acceptation.** Un redémarrage au tout début n'archive rien ; l'archivage manuel enregistre tout ; le compteur de génération ne saute pas ; les valeurs initiales de `globals.js` et de la page sont identiques (`archive-filter.test.cjs`, 4 tests ; `generation-counter.test.cjs`, 2 tests ; `defaults.test.cjs`, 1 test).

---

### Tâche 60 — Habillage visuel : décor, calque en cache, monoplaces `[done]`

**Objectif.** Un rendu lisible et agréable sans coût par image ni effet sur les calculs.

**Travail réalisé.**
- `Track.js` : `paintTrackScene(g)` peint **une seule fois** le décor fixe dans un calque `trackLayer` (`p5.Graphics`) ; `drawTrackSurface()` ne fait que recopier ce calque à chaque image ; le calque est invalidé par `setupTrack()` et reconstruit si la taille du canvas change ; sans `createGraphics`, la scène est peinte directement (pas de plantage). Éléments : herbe rayée, infield, décor extérieur (`createOuterScenery()` : arbres, pins, buissons, rochers, fleurs, déterministes, triés de l'arrière vers l'avant et à l'écart de la piste et de ses dégagements), gravier, asphalte, vibreurs, ligne d'arrivée avec portique, vignettage. `currentOuterBoundary` mémorise le bord extérieur. Les murs de collision ne sont retracés qu'en mode debug.
- `Car.js` : `parseHexColor()` / `shadeColor()` ; `show()` dessine une monoplace (ailerons, roues, cockpit, feux de freinage allumés seulement à faible vitesse) ; le leader a un halo et une traînée plafonnée (`trail`, 26 points) ; les voitures mortes sont masquées, sauf le leader.

**Critère d'acceptation.** Le décor reste dans le canvas, hors piste, identique pour un même circuit ; le calque est peint une fois puis copié ; seules les voitures du leader ont halo et traînée ; aucun de ces éléments n'influence un calcul (`visuals.test.cjs`, 15 tests).

---

### Tâche 61 — Son synthétisé et effets visuels `[done]`

**Objectif.** Rendre la simulation vivante sans fichier audio ni impact sur l'apprentissage.

**Travail réalisé.**
- `Sound.js` (nouveau) : `SoundEngine` synthétisé avec Web Audio, **aucun fichier à charger**. Moteur unique (celui du leader, hauteur = vitesse) et sons ponctuels : collision, checkpoint, dérapage, arrivée, nouvelle génération, fanfare de réussite, départ de course, clic. Le contexte audio n'est créé qu'au premier geste de l'utilisateur (`unlock()`) ; avant, tout est un no-op silencieux ; désactiver le son coupe tout le mix (moteur arrêté et déconnecté) ; au plus 16 voix ponctuelles simultanées. Préférences (`enabled`, `volume`, `effects`) validées par `sanitizeSoundPrefs()` et enregistrées sous la clé `neuroRacingSoundPrefs`, à part des réglages de simulation.
- `Effects.js` (nouveau) : `EffectsSystem` — étincelles et débris, fumée de pneus, confettis, flash des checkpoints, flash d'écran ; au plus 600 particules ; générateur **local** à graine fixe (jamais `Random.js`), donc sans effet sur la reproductibilité.
- `main.js` : `emitGameEvent(type, data)` (types `crash`, `finish`, `success`, `generation`, `raceStart`), `handleCarDeath()`, `updateEffectsAndSound(leader)` (une fois par image affichée), `bindSoundControls()`. Au-delà de 3 cycles par image (`FX_FAST_FORWARD_STEPS`), l'entraînement accéléré est silencieux et seuls les chocs du leader produisent des effets.
- `index.html` : `#soundButton`, `#soundToggle`, `#volumeSlider`, `#effectsToggle`.

**Critère d'acceptation.** Sans geste préalable aucun son n'est créé ni joué ; désactiver le son coupe tout le mix et un volume nul ne crée aucune source ; les préférences invalides ou un stockage refusé retombent sur les valeurs par défaut sans erreur ; le nombre de particules et de voix est plafonné ; ni le son ni les effets ne tirent dans le générateur à graine ; seuls les chocs (collision ou sortie du canvas) produisent un bruit de crash, pas les stagnations ; l'entraînement accéléré est silencieux (`sound-effects.test.cjs`, 36 tests).

---

---

## Récapitulatif d'avancement

| Phase | Tâches | Statut |
|---|---|---|
| 0. Cadrage et socle | 1 – 4 | `[done]` |
| 1. Le monde | 5 – 11 | `[done]` |
| 2. La perception | 12 – 13 | `[done]` |
| 3. Le cerveau | 14 – 17 | `[done]` |
| 4. L'agent | 18 – 23 | `[done]` |
| 5. L'évolution | 24 – 27 | `[done]` |
| 6. L'orchestration | 28 – 30 | `[done]` |
| 7. La persistance | 31 – 32 | `[done]` |
| 8. L'interface | 33 – 40 | `[done]` |
| 9. La qualité | 41 – 46 | `[done]` |
| 10. La documentation | 47 – 48 | `[done]` |
| 11. Évolutions | 49 – 61 | `[done]` |
| **Total** | **61 tâches** | **61 / 61 `[done]`** |

## Définition de « terminé » pour le projet

Le projet est considéré comme terminé lorsque :

1. l'application se lance par `python -m http.server 8000` dans `Conduite Évolutive/` sans erreur de console ;
2. une population évolue visiblement sur les trois circuits prédéfinis, sur un circuit dessiné et en mode multi-circuits ;
3. les cerveaux sont archivés, exportables, importables et comparables en course, y compris sur un circuit inédit ;
4. `node --test tests/*.test.cjs` rapporte 0 échec (246 tests dans 23 fichiers lors de la dernière exécution) ;
5. README, analyse, architecture et spécification décrivent fidèlement le code livré.
