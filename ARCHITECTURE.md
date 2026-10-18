# Architecture des exemples de steering behaviors

Lire ce document avant toute implémentation, avec [AGENTS.md](AGENTS.md). Il décrit les frontières à respecter pour conserver le code pédagogique fourni tout en ajoutant de nouvelles entités et de nouveaux comportements.

## Référence et modèle

Le modèle suit Craig W. Reynolds, *Steering Behaviors for Autonomous Characters* (GDC 1999), disponible dans [ARTICLE_CRAIG_REYNOLDS](ARTICLE_CRAIG_REYNOLDS/Steering%20Behaviors%20For%20Autonomous%20Characters.pdf). La hiérarchie des trois niveaux est présentée page 2 du PDF ; le véhicule simple pages 4–7 ; les comportements et leur composition dans les sections suivantes, notamment pages 16–17 pour la combinaison.

```text
Objectif et perception (sélection d'action)
                  |
                  v
Sous-classe : calcul et composition des forces (steering)
                  |
                  v
Vehicle.applyForce() puis Vehicle.update() (locomotion fournie)
                  |
                  v
Règles de scène explicites, puis rendu
```

Le steering choisit comment modifier la vitesse ; il ne remplace pas la locomotion par une trajectoire codée à la main. Les téléportations de réapparition, lorsqu'elles sont demandées, sont des événements de scène distincts.

## 1. Base protégée : tous les `vehicle.js`

Chaque exemple possède sa propre classe `Vehicle`. Ces variantes contiennent du code fourni, des comportements et parfois d'autres classes. Leurs signatures, paramètres et détails d'intégration ne sont pas nécessairement identiques.

**Ne jamais modifier un `vehicle.js` sans accord explicite préalable de l'utilisateur pour le changement envisagé.** La règle s'applique au fichier entier, même pour une correction apparemment évidente, une classe `Target` placée en fin de fichier ou un simple reformatage. Ne pas déplacer son contenu vers un autre fichier pour contourner la protection.

Si une évolution semble nécessiter de toucher à la base : chercher d'abord une extension par héritage, puis, si cela reste indispensable, expliquer précisément le changement et attendre l'accord. Les modifications déjà présentes de l'utilisateur restent à préserver.

## 2. Toute entité mobile est un Vehicle

Tout objet graphique qui se déplace dans le monde simulé doit être un `Vehicle` ou une
sous-classe de `Vehicle`. Sa direction vient d'un steering behavior, ses forces passent
par `applyForce()` et son déplacement est intégré par `update()`. La scène ne modifie
pas directement sa position à chaque frame.

Une cible mobile est donc une vraie entité autonome. Une spécialisation de `Target`
doit être écrite dans son propre fichier : par exemple `TargetFuyante extends Target`
dans `targetFuyante.js`. Elle réutilise l'héritage de `Target` et `Vehicle`, peut
surcharger `flee()` ou `updateFlee()` pour sélectionner et appliquer ses forces, puis
délègue l'intégration à `super.update()`. Un contrôleur de scène ne remplace pas cette
sous-classe en appliquant lui-même des forces à une cible générique.

Les fonctions de scène peuvent sélectionner une menace, gérer un seuil, un cooldown,
une réapparition ou un indicateur d'endurance, mais elles ne deviennent pas une
seconde implémentation de la locomotion. Les éléments purement décoratifs, le plasma,
les boutons et les curseurs ne sont pas des entités mobiles et restent des fonctions
de rendu ou des contrôles DOM.

## 3. Extensions : sous-classes dans des fichiers dédiés

Tout nouveau comportement ou toute spécialisation de comportement appartient à une sous-classe du `Vehicle` de l'exemple concerné. Une nouvelle entité autonome possède son propre fichier :

```text
exemple/
  index.html        # scripts chargés dans l'ordre des dépendances
  libraries/        # p5.js et bibliothèques existantes
  vehicle.js        # base fournie, protégée
  enemy.js          # class Enemy extends Vehicle
  missile.js        # class Missile extends Vehicle
  obstacle.js       # class Obstacle extends Vehicle si l'exercice en ajoute
  sketch.js         # création, entrées, boucle de scène
  style.css         # présentation
  tests/            # tests des fonctionnalités ajoutées
  README.md         # paramètres, lancement et validation
```

Cet arbre est une convention pour les évolutions futures, pas une liste de fichiers déjà présents. Ne pas créer les entités qui ne sont pas nécessaires à la demande.

- Appeler `super(...)` dans le constructeur et garder `pos`, `vel`, `acc`, `maxSpeed` et `maxForce` compatibles avec la base locale.
- Réutiliser les comportements existants avec `super.seek(...)`, par exemple, si leur contrat convient. Pour une variante, surcharger la méthode dans la sous-classe et conserver le fichier de base intact.
- Surcharger `applyBehaviors()` pour sélectionner ou composer les forces lorsque cette méthode convient à l'API locale ; sinon ajouter une méthode dédiée dans la sous-classe.
- Passer le bon type : une méthode `seek(position)` reçoit un `p5.Vector`, tandis qu'un comportement prédictif peut recevoir une entité avec `pos` et `vel`. Documenter le contrat au lieu de supposer que toutes les méthodes acceptent les deux.
- Les fonctions utilitaires pures peuvent aider au calcul, mais la nouvelle capacité de steering reste exposée et intégrée par la sous-classe.
- Ne pas recopier la base ou redéfinir son prototype. Ne pas créer une seconde méthode du même nom dans une classe : la dernière masquerait la première.

Les obstacles représentés comme entités de la simulation suivent la même organisation ; une sous-classe immobile n'a pas à appeler `update()`. Les contrôles HTML, le fond et les services audio peuvent être de simples fonctions ou services, sans héritage de `Vehicle`.

## 4. Forces et locomotion

Pour un seek classique :

```text
direction = targetPosition - position
desiredVelocity = direction normalisée * maxSpeed
steering = desiredVelocity - velocity
force = steering limitée à maxForce
```

Définir explicitement le cas `direction = 0`, puis tester le résultat voulu. Un vecteur nul de force ne signifie pas que la vitesse existante s'annule instantanément.

Une nouvelle sous-classe calcule les composantes de steering, les pondère ou les sélectionne, limite la force résultante, puis appelle `applyForce()`. La scène ou la sous-classe appelle ensuite la mise à jour héritée **une seule fois par pas**. Une surcharge d'`update()` pour ajouter un état propre doit déléguer à `super.update()` une seule fois, sans réimplémenter l'intégration.

Ne pas changer les unités du mouvement sans conception explicite : conserver le modèle par image de la base existante. Ajouter `deltaTime` à un seul niveau produirait un modèle incohérent. La méthode `edges()` ne doit être appelée que conformément à la règle de bord choisie ; vérifier si elle est déjà appelée par l'implémentation locale.

## 5. Scène, rendu et ressources

`sketch.js` reste le contrôleur de l'exemple : initialisation dans `setup()`, collecte des entrées, choix des cibles, mise à jour de la population et orchestration de `draw()`. Il ne doit pas accumuler les nouvelles classes d'entités ni leurs formules de steering.

Pour chaque pas, actualiser les entrées et cibles selon un ordre documenté, calculer/appliquer les forces, intégrer une seule fois, traiter les règles de scène et dessiner. Si l'ordre d'actualisation des voisins influence les résultats, utiliser un instantané cohérent de leurs états pour le calcul collectif.

Les nouvelles méthodes de dessin isolent leurs styles et transformations par `push()` / `pop()`. Elles ne changent pas les forces ou positions. Un rendu de diagnostic peut lire les forces et rayons déjà calculés, sans réexécuter un comportement aléatoire.

Initialiser contrôles et écouteurs une seule fois. Garder des références pour nettoyer les timers, écouteurs ou nœuds audio ajoutés. Ne pas modifier le code historique hors périmètre pour le rendre conforme rétroactivement à ces conventions.

## 6. Chargement et autonomie des exemples

Pour des scripts classiques, charger p5.js, `vehicle.js`, les sous-classes et aides nécessaires, puis `sketch.js`. Lire les classes déjà déclarées avant d'ajouter un nouveau nom : dans `3-Arrival` et `3-Arrival_correction`, `Target` est déjà déclarée dans `vehicle.js`.

Conserver l'autonomie de chaque sous-dossier et sa version de p5.js. Une classe d'un exemple ne doit pas dépendre implicitement d'un autre dossier ni imposer une refonte des bases existantes. Ne pas convertir en modules ou en mode instance sans besoin lié à la demande et vérification du chargement.

## 7. Tests et condition de livraison

Chaque fonctionnalité ajoutée comporte des tests unitaires dans l'exemple concerné. Respecter les exigences de [AGENTS.md](AGENTS.md) : vraies méthodes testées, aléatoire reproductible, limites de force/vitesse, cas géométriques et composition selon le changement.

Séparer les tests mathématiques et d'état des vérifications navigateur. Un adaptateur vectoriel en test n'est pas la bibliothèque p5 réelle ; les interactions, le rendu et l'audio nécessitent une validation d'intégration adaptée. Tester les conséquences observables, pas seulement les libellés ou les appels de méthodes.

À l'état initial du dépôt, il n'existe pas de lanceur global configuré. En ajouter un léger avec la première fonctionnalité qui en a besoin et documenter la commande réellement exécutable. Ne pas annoncer qu'une suite a réussi si elle n'existe pas ou n'a pas été exécutée.

**Tous les tests de validation concernés doivent passer avant de proposer à l'utilisateur de faire un essai.** En cas d'échec ou de blocage, corriger ou expliquer précisément la limite ; ne pas présenter la fonctionnalité comme terminée et validée. Confirmer aussi que les fichiers `vehicle.js` n'ont pas été altérés par le travail de l'agent, sauf autorisation spécifique.

## Sources p5.js

Les références officielles et les conventions de codage applicables sont regroupées dans [AGENTS.md](AGENTS.md#références-p5js-consultées), notamment le [guide de style des exemples](https://p5js.org/contribute/documentation_style_guide/). Leur usage ne remplace ni les contrats des bases locales ni les exigences pédagogiques de ce dépôt.

## 8. Entités de scène, perception et scénarios

Toute entité du monde représentée graphiquement est un `Vehicle` ou une sous-classe, y compris les entités actuellement immobiles. Les contrôles DOM, le fond et les superpositions de diagnostic restent des éléments d'interface ou de rendu. Le passage d'immobile à mobile doit utiliser les steering behaviors et la locomotion héritée.

Une cible fuyante est définie dans un fichier dédié. Elle peut étendre le `Target` local (lui-même sous-classe de `Vehicle`) pour conserver son comportement normal et spécialiser uniquement la perception, les états de fuite et le rendu d'endurance. La fuite réutilise la méthode héritée avec `super.flee()` et ne recopie pas ses formules dans `sketch.js`.

Le contrôleur choisit le scénario et transmet les véhicules et le temps écoulé ; l'entité porte les transitions normal/fuite/épuisement. Pendant la fuite, suivre les distances réelles aux prédateurs au-delà du rayon de détection, jusqu'à la distance de sécurité. Restaurer les limites normales à la sortie et prévoir un réarmement explicite après épuisement. Le rendu debug affiche l'état de perception sans modifier le steering.

Quand la description du scénario courant ne correspond pas au dossier précédemment travaillé, clarifier le dossier avant de remplacer le sketch. Préserver les autres exercices et les modifications déjà présentes.

**Sons et effets** : `Sound.js` (classe `SoundEngine`, Web Audio synthétisé, déverrouillé par un geste, plafond de voix, moteur de la voiture de tête) et `Effects.js` (classe `EffectsSystem`, particules à générateur local). `main.js` les relie à la simulation via `emitGameEvent`, `handleCarDeath` (`car.crashed` est posé par `checkCollisions`) et `updateEffectsAndSound`, appelée une fois par image dans `draw()`; `bindSoundControls` gère le panneau et le bouton du bandeau.

---

# Annexe — Neuro Racing (`Conduite Évolutive/`)

Cette annexe s'**ajoute** au document ci-dessus. Tout ce qui précède décrit les exemples de *steering behaviors* du dépôt d'origine. **Neuro Racing**, la neuroévolution de voitures autonomes, vit dans `Conduite Évolutive/`. Le détail complet (flux, formats JSON, tests, points d'attention) est dans [`Conduite Évolutive/ARCHITECTURE.md`](<Conduite Évolutive/ARCHITECTURE.md>) ; le plan de réalisation est dans [`Conduite Évolutive/SPECIFICATION.md`](<Conduite Évolutive/SPECIFICATION.md>) ; les consignes de travail sont dans la section « Projet Neuro Racing » de [AGENTS.md](AGENTS.md#projet-neuro-racing--consignes-spécifiques). Ce qui suit est le résumé à connaître avant de toucher au projet.

## 9. Lien avec le modèle de Reynolds

Neuro Racing reprend la séparation de Reynolds (*sélection d'action → steering → locomotion*) en remplaçant la sélection d'action par un réseau de neurones :

```text
PERCEPTION            DÉCISION              STEERING / LOCOMOTION           RÈGLES DE COURSE
5 rayons + vitesse →  réseau 6 → H → 2  →   desiredVel − vel (≤ maxForce) → collision, checkpoint,
(6 entrées [0,1])     (TensorFlow.js)        applyForce → Vehicle.update      stagnation, sens inverse
```

Le réseau ne produit que des **commandes** (cap, poussée) ; collisions, checkpoints et fin de tour sont des règles explicites. `Car extends Vehicle` : la locomotion de `js/Vehicle.js` (protégée comme tout `vehicle.js`, voir §1) est intégrée une seule fois par pas, en unités **par pas de simulation**.

## 10. Écarts avec les conventions des exemples

| Convention des exemples | Neuro Racing |
|---|---|
| `vehicle.js`, `sketch.js` | `js/Vehicle.js` (protégé), `js/main.js` (orchestrateur, chargé en dernier) |
| p5.js 1.7.0 embarqué dans `libraries/` | p5.js 1.9.0 et TensorFlow.js 4.20.0 par CDN jsDelivr |
| Sous-classes d'entités dans des fichiers dédiés | Un fichier par responsabilité dans `js/` ; `Car` est la seule entité mobile |
| Tests `*.test.mjs` | `tests/*.test.cjs` (`node:test` + `node:vm`), 246 tests dans 23 fichiers |
| Pas de lanceur global | `node --test tests/*.test.cjs` depuis `Conduite Évolutive/` |

## 11. Arborescence du projet

```text
Conduite Évolutive/            ← racine à servir en HTTP statique
├── index.html                 Structure DOM et ordre de chargement des scripts
├── ARCHITECTURE.md  SPECIFICATION.md  analyse.md
├── css/style.css              Thème sombre, panneaux flottants, HUD
├── js/
│   ├── globals.js             État et réglages partagés (var)
│   ├── utils.js               Géométrie : point/segment, segment/segment, segment/rectangle orienté
│   ├── Random.js              Hasard à graine (mulberry32)
│   ├── NeuralNetwork.js       Réseau dense TF.js : prédire, copier, muter, croiser, JSON
│   ├── BrainStorage.js        Archive localStorage, import/export, écriture unique commit()
│   ├── Settings.js            Réglages persistants (localStorage)
│   ├── Sound.js               Sons synthétisés (Web Audio), préférences
│   ├── Effects.js             Particules, confettis, flashs (générateur local)
│   ├── Ray.js                 Rayon et intersection rayon/segment
│   ├── Track.js               Circuits, bordures, checkpoints, éditeur, rendu du décor
│   ├── Vehicle.js             Locomotion de base (protégée)
│   ├── Car.js                 Vehicle + perception + cerveau + règles de vie
│   ├── Genetic.js             Fitness, tournoi, élitisme, croisement, génération suivante, archivage
│   ├── MultiTrack.js          Entraînement sur plusieurs circuits
│   ├── Generalization.js      Course : circuit connu ou inédit
│   └── main.js                Boucle p5, interface, éditeur, course
└── tests/                     helpers.cjs + 23 fichiers *.test.cjs
```

## 12. Ordre de chargement (contrainte forte)

Pas de modules : l'ordre des `<script>` d'`index.html` est le graphe de dépendances.

```text
p5 → tf → globals → utils → Random → NeuralNetwork → BrainStorage → Settings → Sound → Effects
        → Ray → Track → Vehicle → Car → Genetic → MultiTrack → Generalization → main
```

Ajouter un fichier = l'insérer avant les scripts qui l'utilisent. `main.js` reste le dernier : p5 en mode global cherche `setup()` et `draw()` sur `window`.

## 13. Couches et responsabilités

| Couche | Fichiers | Rôle |
|---|---|---|
| Monde | `Track.js`, `utils.js`, `globals.js` | Géométrie, murs, checkpoints, paramètres |
| Locomotion | `Vehicle.js` | `applyForce`, `update` |
| Agent | `Car.js`, `NeuralNetwork.js`, `Ray.js` | Percevoir, décider, score individuel, mort |
| Évolution | `Genetic.js`, `MultiTrack.js`, `BrainStorage.js`, `Random.js` | Fitness, sélection, élitisme, croisement, mutation, archive, graine |
| Orchestration | `main.js`, `Generalization.js`, `Settings.js` | Modes, pas de simulation, course, éditeur, réglages |
| Interface et décor | `index.html`, `style.css`, `Sound.js`, `Effects.js` | Structure, style, son, effets (sans effet sur la simulation) |

## 14. Boucle et machine à états

- `draw()` : fond, simulation selon le mode (course, entraînement, éditeur), rendu, diagramme du réseau toutes les 15 images (panneau ouvert seulement), HUD toutes les 6 images. `TRAINING_STEPS_PER_FRAME` (1 à 10) répète le pas d'entraînement ; la course reste à 1 pas par image.
- Pas d'entraînement, dans l'ordre : `think` → `update` → `updateTrackProgress` → `checkCheckpoints` → `checkCollisions`. Quand `cars` est vide : `nextGeneration()` puis `generation++` (sauf réussite : reprise par « Continuer l'évolution »).
- Modes : drapeaux `trainingActive`, `trainingFinished`, `raceMode`, `trackEditorActive`. États : initialisation, entraînement, pause, réussite, éditeur, course ; l'éditeur et la course mémorisent l'état précédent pour le restaurer.

## 15. Évolution et persistance

- Génération : fitness → taux de succès → historique → archive du top 3 (voitures qui ont progressé) → arrêt si le seuil est atteint → sinon `buildNextPopulation()` : élites sans mutation (`ELITE_COUNT`), puis tournoi (5 candidats), croisement par neurone caché avec la probabilité `CROSSOVER_RATE` ou copie d'un seul parent, puis mutation gaussienne.
- Multi-circuits : une génération = un tour par circuit coché ; score et fitness sont la moyenne des tours ; réussite = tous les circuits bouclés.
- Course : un pas par image, chronomètre en images simulées (`raceFrames`, 60 = 1 s), classement au temps de tour, bilan « circuit inédit / déjà vu » grâce à `trainedOn`.

| Donnée | Support | Durée de vie |
|---|---|---|
| Archive des cerveaux (40 max) | `localStorage`, clé `neuroevolution-racing-brains-v1` (+ sauvegarde `…-corrupted-backup`) | Persistante |
| Réglages de l'interface | `localStorage`, clé `neuroevolution-racing-settings-v1` | Persistante, validée à la relecture |
| Préférences son et effets | `localStorage`, clé `neuroRacingSoundPrefs` | Persistante |
| Historique d'apprentissage (250 générations), circuit dessiné | Variables `learningHistory`, `customTrackPath` | Session |

Formats : cerveau sérialisé (`inputNodes`, `hiddenNodes`, `outputNodes`, `activation`, 4 tenseurs dans un ordre imposé), enregistrement d'archive (`id`, `name`, `score`, `brain` obligatoires), export `{ format: "neuroevolution-brains", version: 1, brains }`. Détail dans `Conduite Évolutive/ARCHITECTURE.md` §10.

## 16. Règles d'architecture à respecter

1. Le réseau ne décide jamais des règles du monde.
2. Une seule intégration physique par pas ; aucune multiplication par `deltaTime`.
3. Tout le hasard de la simulation passe par `Random.js` ; le son et les effets n'y touchent pas.
4. Tout cerveau abandonné est libéré (`dispose()`), les calculs intermédiaires passent par `tf.tidy`.
5. Une seule écriture de l'archive (`commit()`), un seul point de réinitialisation (`restartTraining`), un seul constructeur de génération (`buildNextPopulation`).
6. Toute donnée externe est validée ; les erreurs sont affichées par `setStatus(..., true)`.
7. DOM sans `innerHTML` pour les données variables ; rendu isolé par `push()` / `pop()`.
8. Interface en français et accessible.

## 17. Extensions et tests

| Je veux… | Où intervenir |
|---|---|
| Ajouter ou modifier un capteur, une sortie | `NB_ASSETS`, `Car.look`, `Car.think`, `NeuralNetwork`, libellés du diagramme ; archive à versionner |
| Changer la fitness | `scoreCarFitness` (`Genetic.js`) et `fitness-progress.test.cjs` |
| Ajouter un opérateur génétique | `buildNextPopulation` / `createChild` (`Genetic.js`) |
| Ajouter un tirage aléatoire | `Random.js` ; jamais `Math.random()` dans la simulation |
| Ajouter un circuit prédéfini | `Track.setupTrack`, option dans `#trackSelect`, `trackLabel`, `Generalization.js` |
| Ajouter un réglage persistant | `globals.js`, `index.html`, `bindControls`, `SETTING_DEFINITIONS` |
| Ajouter un son ou un effet | `Sound.js` / `Effects.js`, puis `emitGameEvent` dans `main.js` |

Tests : `cd "Conduite Évolutive"` puis `node --test tests/*.test.cjs`. Les tests exécutent les vrais fichiers de `js/` dans `node:vm` avec des substituts de p5, de TensorFlow.js, du stockage et du DOM (`tests/helpers.cjs`) : ils vérifient la logique, pas le rendu, le chargement des CDN ni la qualité d'apprentissage.
