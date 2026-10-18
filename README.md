# Neuro Racing — rapport de projet

**Projet :** apprentissage par neuroévolution de voitures autonomes<br>
**Réalisé par :** HAJAR BELHACHMI<br>
**Formation :** Master IA2, Université Côte d’Azur<br>
**Année universitaire :** 2026/2027

## Résumé

Neuro Racing est une simulation pédagogique dans laquelle une population de voitures apprend à parcourir un circuit fermé. Chaque voiture reçoit des mesures de son environnement produites par cinq rayons de perception et sa vitesse, puis transmet ces six valeurs à un réseau de neurones. Les deux sorties du réseau pilotent sa direction et sa propulsion. Après chaque génération, un algorithme de sélection et de mutation fait évoluer les poids des réseaux les mieux évalués.

L’application fonctionne dans le navigateur. Elle permet de modifier la population et les paramètres d’apprentissage, de choisir ou dessiner un circuit, de suivre les résultats, d’inspecter le réseau du meilleur agent et d’archiver des cerveaux pour les comparer dans une course.

## 1. Introduction

Les véhicules autonomes doivent transformer des observations locales en décisions de déplacement. Neuro Racing illustre cette chaîne à petite échelle : les rayons jouent le rôle de capteurs, le réseau neuronal transforme les mesures en commandes, et la simulation applique ces commandes au véhicule. Les voitures ne reçoivent pas une trajectoire à suivre ni des règles de conduite manuelles : leurs paramètres de décision sont ajustés d’une génération à l’autre par une méthode évolutionnaire.

Ce projet met ainsi en relation plusieurs notions fondamentales de l’intelligence artificielle : perception, réseau neuronal dense, fonction de performance, sélection, mutation, expérimentation et comparaison. L’interface rend une partie de ces mécanismes observable, ce qui permet de confronter le comportement des agents aux réglages et aux données affichées.

## 2. Objectifs

Les objectifs du projet sont les suivants :

1. Construire une simulation visuelle de voitures autonomes sur des circuits fermés.
2. Fournir aux agents des entrées mesurées plutôt qu’une connaissance directe du tracé.
3. Utiliser un réseau neuronal pour convertir ces entrées en commandes de direction et d’accélération.
4. Faire évoluer les poids du réseau avec une sélection fondée sur les performances et une mutation aléatoire.
5. Évaluer les voitures à partir de leur progression, de leur vitesse, de leurs checkpoints et de leur comportement.
6. Permettre de régler l’expérience, d’inspecter les capteurs et d’observer l’évolution des résultats.
7. Conserver, exporter, importer et mettre en compétition les meilleurs réseaux obtenus.
8. Proposer des circuits prédéfinis et un éditeur de piste afin d’étudier l’effet de la géométrie sur l’apprentissage.

## 3. Description générale du projet

Au démarrage, une population de voitures est créée sur la ligne de départ. Chaque voiture possède un cerveau avec la même architecture, mais les poids initiaux sont générés par le réseau. À chaque pas de simulation, elle mesure son environnement, calcule une décision, met à jour sa vitesse et sa position, puis vérifie si elle a franchi un checkpoint ou rencontré une limite.

Une voiture est retirée de la population active lorsqu’elle termine le tour, heurte un mur, quitte la fenêtre ou ne progresse plus suffisamment. Quand toutes les voitures de la génération ont terminé leur parcours ou sont hors course, leurs performances sont évaluées. Les meilleurs individus servent ensuite de parents à la génération suivante. La simulation peut s’arrêter automatiquement lorsque la proportion de voitures ayant terminé le circuit atteint le seuil choisi.

L’application distingue trois phases :

- **Entraînement :** une population évolue sur le circuit sélectionné.
- **Archivage :** des réseaux performants sont sauvegardés dans le navigateur ou dans un fichier JSON.
- **Course comparative :** plusieurs réseaux archivés conduisent simultanément sur le même circuit, avec les mêmes réglages physiques. Un chronomètre et un classement au temps de tour départagent les cerveaux.

## 4. Technologies utilisées et justification

| Technologie | Utilisation dans le projet | Justification |
|---|---|---|
| **JavaScript** | Logique de simulation, réseau, évolution, contrôles et interface. | Permet de garder l’application exécutable directement dans un navigateur, sans compilation ni chaîne de construction. |
| **p5.js 1.9.0** | Canvas, dessin des circuits et voitures, vecteurs, calculs et boucle d’animation. | Fournit des outils simples pour une simulation visuelle interactive et pédagogique. |
| **TensorFlow.js 4.20.0** | Création, calcul, copie, mutation et sérialisation des réseaux neuronaux. | Exécute les prédictions du réseau dans le navigateur et offre des couches denses sans serveur d’inférence. |
| **HTML et CSS** | Structure des panneaux, curseurs, boutons, diagrammes et présentation. | Sépare les contrôles et les informations de la simulation du rendu du circuit. |
| **Web Storage (`localStorage`)** | Conservation des cerveaux entraînés sur l’origine du site. | Rend l’archive disponible après rechargement sans exiger de compte ni de service distant. |
| **Web Audio API** | Sons synthétisés : moteur, collisions, arrivées, fanfare (section 17). | Aucun fichier audio à charger : les sons sont produits par des oscillateurs et du bruit filtré, directement dans le navigateur. |
| **Node.js et `node:test`** | Exécution des tests automatisés existants. | Fournit un lanceur de tests intégré, sans dépendance supplémentaire pour cette suite. |

Les scripts p5.js et TensorFlow.js sont chargés depuis **jsDelivr** avec des versions indiquées dans [index.html](./Conduite%20Évolutive/index.html). L’application nécessite donc une connexion Internet au chargement des bibliothèques. Les sources de la simulation sont réparties dans des fichiers JavaScript classiques, chargés dans l’ordre de leurs dépendances.

## 5. Organisation du code

Les fichiers de l’application se trouvent dans le dossier `Conduite Évolutive/` ; les liens ci-dessous partent de la racine du dépôt. Les scripts sont listés dans leur ordre de chargement.

- [globals.js](./Conduite%20Évolutive/js/globals.js) contient les paramètres et l’état partagés de l’expérience.
- [utils.js](./Conduite%20Évolutive/js/utils.js) fournit les calculs géométriques : distance point-segment, distance segment-segment (collision balayée) et intersection segment-rectangle orienté (rectangle de la voiture).
- [Random.js](./Conduite%20Évolutive/js/Random.js) fournit le hasard à graine de la simulation : mêmes graine et réglages, même expérience (section 9).
- [NeuralNetwork.js](./Conduite%20Évolutive/js/NeuralNetwork.js) définit l’architecture, les prédictions, les mutations, le croisement et la représentation JSON des cerveaux.
- [BrainStorage.js](./Conduite%20Évolutive/js/BrainStorage.js) valide, sauvegarde, importe, exporte et répare l’archive locale.
- [Settings.js](./Conduite%20Évolutive/js/Settings.js) enregistre et restaure les réglages de l’interface entre les sessions.
- [Sound.js](./Conduite%20Évolutive/js/Sound.js) synthétise les sons avec Web Audio (section 17).
- [Effects.js](./Conduite%20Évolutive/js/Effects.js) gère les particules et flashs décoratifs (section 17).
- [Ray.js](./Conduite%20Évolutive/js/Ray.js) calcule les intersections des rayons avec les segments des murs et dessine les mesures.
- [Track.js](./Conduite%20Évolutive/js/Track.js) construit les circuits, les murs et les checkpoints, valide les tracés dessinés (fermeture, croisements) et peint le décor.
- [Vehicle.js](./Conduite%20Évolutive/js/Vehicle.js) intègre les forces, vitesses et positions.
- [Car.js](./Conduite%20Évolutive/js/Car.js) spécialise le véhicule : perception, décision neuronale, score, cycle de vie et dessin de la monoplace.
- [Genetic.js](./Conduite%20Évolutive/js/Genetic.js) calcule la performance et prépare la génération suivante (élitisme, tournoi, croisement, mutation) ainsi que l’archivage.
- [MultiTrack.js](./Conduite%20Évolutive/js/MultiTrack.js) enchaîne, dans une même génération, un tour par circuit d’entraînement et agrège les résultats (section 10).
- [Generalization.js](./Conduite%20Évolutive/js/Generalization.js) compare les circuits d’entraînement d’un cerveau au circuit de la course : « connu » ou « inédit » (section 13).
- [main.js](./Conduite%20Évolutive/js/main.js) orchestre l’initialisation, la simulation, l’interface, les graphiques, l’éditeur de piste, les courses, la graine et le raccordement des sons et effets.
- [style.css](./Conduite%20Évolutive/css/style.css) définit la présentation et la disposition de l’interface.
- [tests/](./Conduite%20Évolutive/tests/) regroupe les tests automatisés.

Documents complémentaires dans le même dossier : [ARCHITECTURE.md](./Conduite%20Évolutive/ARCHITECTURE.md), [analyse.md](./Conduite%20Évolutive/analyse.md) et [SPECIFICATION.md](./Conduite%20Évolutive/SPECIFICATION.md).

## 6. Perception : comment fonctionnent les rayons

La voiture utilise **cinq rayons** répartis dans un champ de vision de **120°**, centré sur son cap courant. Le cap provient de l’orientation de sa vitesse. Chaque rayon part de la position de la voiture et recherche, parmi les segments des murs, l’intersection la plus proche située à **150 pixels au maximum**.

Pour chaque rayon, la distance mesurée est normalisée pour former une entrée comprise entre 0 et 1 :

- un mur immédiatement proche produit une valeur proche de **1** ;
- un mur à la portée maximale de 150 pixels produit **0** ;
- en l’absence d’intersection dans cette portée, l’entrée vaut également **0**.

Le sixième capteur fournit la vitesse normalisée : vitesse actuelle divisée par la vitesse maximale autorisée. Le vecteur des entrées est donc de la forme :

```text
[rayon gauche, rayon gauche-centre, rayon central,
 rayon droite-centre, rayon droit, vitesse normalisée]
```

La normalisation présente des valeurs à échelle comparable au réseau. Les rayons détectent uniquement les segments des murs ; ils ne calculent pas une trajectoire idéale et ne donnent pas directement à la voiture l’emplacement des prochains checkpoints.

### Mode debug

La case **Debug des capteurs et distances** active des informations de diagnostic sur la scène :

- checkpoints et numéros associés ;
- contours des murs de collision, en cyan (hors debug, seul le décor est dessiné) ;
- rayons du meilleur agent actif et points d’intersection détectés ;
- distance mesurée par chaque rayon, en pixels ;
- distances des capteurs dans le HUD lorsque le debug est actif ;
- indication graphique reliant le meilleur agent à son prochain checkpoint.

Le mode debug sert à comprendre ce que l’agent perçoit, notamment lorsqu’il s’approche d’un mur. Il ne change pas les entrées, les poids ou les règles de décision du réseau.

## 7. Réseau de neurones et commande des voitures

### Architecture

Le réseau est un perceptron multicouche entièrement connecté à trois niveaux :

```text
6 entrées → H neurones cachés → 2 sorties
```

`H` est le nombre de neurones de la couche cachée, réglable dans l’interface. Les deux sorties correspondent à la **direction** et à l’**accélération**. La couche cachée utilise l’activation sélectionnée (sigmoïde, tanh ou ReLU) ; la couche de sortie utilise une sigmoïde, donc les deux commandes sont comprises entre 0 et 1.

### Interprétation des sorties et mouvement

À chaque pas, la première sortie est convertie en variation de cap comprise entre `-maxForce` et `+maxForce`. La seconde est convertie en poussée entre zéro et la vitesse maximale. Pendant les 30 premières étapes d’une voiture, un minimum de poussée égal à la moitié de la vitesse maximale est appliqué pour aider au démarrage.

La simulation construit alors une vitesse désirée à partir du cap et de la poussée, calcule l’écart avec la vitesse courante, limite cet écart par la force maximale, puis l’applique au véhicule. La classe de base met à jour la vitesse et la limite à `maxSpeed`, déplace la voiture et remet l’accélération à zéro. Ce mécanisme fournit une locomotion cohérente sans demander au réseau de produire directement des coordonnées.

Le réglage **Accélération / force** correspond à `maxForce` dans la simulation. Le code s’en sert aussi pour borner la variation de direction commandée par la première sortie ; il ne s’agit donc pas d’un réglage indépendant de l’angle et de la force.

## 8. Entraînement et algorithme évolutionnaire

### Évaluation des individus

La valeur de score augmente de **50 points par checkpoint validé** et de **200 points lorsqu’un tour complet est achevé**. La fitness utilisée pour classer les parents combine plusieurs signaux :

- score obtenu aux checkpoints et à l’arrivée ;
- progression vers l’avant le long de la ligne médiane, plafonnée à la longueur du circuit et pondérée par 0,12 ;
- vitesse moyenne, pondérée par 8 ;
- pénalités d’immobilité, de délai excessif sans checkpoint et de conduite à contresens ;
- petit bonus de proximité du prochain checkpoint.

Cette fitness tente de distinguer une voiture qui avance réellement d’un agent qui reste près du départ ou tourne sans progresser. Le score affiché et la fitness de sélection sont liés, mais ne sont pas identiques.

### Création de la génération suivante

À la fin d’une génération, les voitures sont classées par fitness. Pour sélectionner chaque parent, l’algorithme tire jusqu’à cinq individus au hasard et retient le meilleur de ce tournoi. Il copie son réseau, puis mute chaque poids ou biais indépendamment avec la probabilité définie par le taux de mutation. Les valeurs mutées reçoivent une perturbation gaussienne d’écart-type 0,1. Les nouveaux individus héritent ainsi de réseaux proches de ceux des parents, mais susceptibles d’explorer d’autres commandes.

**Élitisme :** avant ces tirages, le meilleur cerveau de la génération (selon la fitness) est reconduit **tel quel, sans mutation** : il occupe une place de la nouvelle population (`ELITE_COUNT = 1` dans `globals.js`) et repart du même point de départ que lors de son tour. Il rejoue donc exactement la même performance, ce qui évite qu’une mutation défavorable fasse reculer le meilleur score d’une génération à l’autre. Les autres places restent issues du tournoi et de la mutation. L’élite ne réduit pas la diversité de l’exploration, mais elle peut ralentir la sortie d’un optimum local si elle domine longtemps les tournois.

**Croisement :** avec la probabilité du **taux de croisement** (70 % par défaut), un enfant naît de deux parents distincts, chacun tiré par un tournoi séparé. Le croisement se fait **par neurone caché** : chaque neurone de l’enfant est hérité d’un seul des deux parents, avec ses poids d’entrée, son biais et ses poids de sortie (le biais de chaque sortie est lui aussi tiré au hasard). Un neurone reste ainsi une unité cohérente, ce qui perturbe moins le comportement qu’un mélange poids par poids. Sinon, l’enfant est la copie d’un seul parent. Dans les deux cas, la mutation est appliquée ensuite. Les élites ne sont jamais croisées. Si les deux parents n’ont pas la même architecture, l’enfant est une copie du premier.

L’implémentation actuelle utilise donc **l’élitisme, la sélection par tournoi, le croisement et la mutation**. Si aucun parent n’est disponible, un nouveau réseau est créé. Le processus recommence avec l’effectif indiqué par **Voitures par génération**.

### Arrêt sur réussite et reprise

Le seuil de réussite porte sur le **pourcentage de voitures qui ont terminé le tour pendant une génération**. Par exemple, avec un seuil à 60 %, une population de 50 doit compter au moins 30 voitures ayant fini pour déclencher l’arrêt automatique. À l’arrêt, l’interface propose **Continuer l’évolution** ; cette action crée une nouvelle génération à partir des voitures archivées en mémoire, en appliquant le taux de mutation courant.

### Fin de vie d’une voiture

Une voiture peut sortir de la course à la suite d’une collision avec un mur, d’une sortie des limites du canvas, d’un départ trop lent, d’une stagnation (immobilité ou rotation en rond), d’un temps trop long sans checkpoint ou d’une conduite à contresens.

**Collision et sortie du canvas.** À chaque pas, deux tests sont faits contre chaque segment de mur. D’une part, la **collision balayée** : le trajet parcouru pendant le pas (de la position précédente à la nouvelle) passe à moins d’environ 5,6 pixels du mur (`largeur / 1,8`). Elle empêche une voiture rapide, qui peut parcourir jusqu’à 20 pixels par pas, de sauter par-dessus un mur. D’autre part, le **rectangle de la voiture** (20 × 10 pixels, orienté selon sa vitesse, comme dessiné) touche le mur à sa position d’arrivée : le museau et les flancs comptent, pas seulement le centre. Sortir des limites du canvas élimine aussi la voiture. Ces deux causes sont les seules à déclencher les sons et effets de choc (section 17) ; les autres éliminations restent silencieuses.

**Démarrage et stagnation.** Si, après 60 étapes de simulation, la voiture se trouve encore à moins de 40 pixels de sa position initiale, elle est éliminée. Ensuite, le déplacement est mesuré par fenêtres de 60 étapes. Une fenêtre est comptée comme stagnation dans deux cas : la voiture s’est déplacée de moins de 20 pixels en ligne droite (immobile ou sur place), ou elle a parcouru plus de 60 pixels de chemin mais son déplacement net n’en représente pas 30 % (elle tourne en rond, y compris sur un grand cercle). Une fenêtre de stagnation ajoute 60 au compteur, une fenêtre normale le remet à zéro, et un compteur supérieur à 120 (donc trois fenêtres consécutives) provoque l’élimination. Ne pas atteindre de checkpoint pendant plus de 1 200 étapes entraîne également l’élimination. Ces compteurs sont en étapes de simulation, pas en secondes réelles ; augmenter le nombre de cycles par image les fait donc défiler plus vite à l’écran.

Le sens de déplacement est comparé à la direction locale du circuit après les 100 premières étapes, lorsque la voiture avance suffisamment vite. Un mouvement à contresens augmente un compteur ; au-delà de 100 unités cumulées, la voiture est éliminée. Un mouvement dans le bon sens réduit ce compteur. La validation des checkpoints fait avancer l’objectif à atteindre et la validation du dernier checkpoint clôt le tour.

## 9. Explication des réglages

Les réglages sont regroupés dans le panneau **Réglages de simulation** en haut à droite. Le bouton de la barre supérieure permet de le masquer ou de l’afficher.

| Réglage | Plage et valeur initiale | Effet et comportement |
|---|---:|---|
| **Vitesse maximale** | 2–20 ; initialement 6 | Borne la vitesse de chaque voiture. La modification s’applique immédiatement aux voitures d’entraînement et de course. |
| **Accélération / force** | 0,1–2 ; initialement 0,5 | Modifie la force maximale d’orientation et la plage angulaire utilisée par la commande du réseau. Appliquée immédiatement aux voitures actives. |
| **Cycles par image · vitesse ×** | 1–10 ; initialement 1 | Nombre de pas d’entraînement calculés avant le rendu suivant. Une valeur supérieure accélère les générations simulées, au prix d’une animation potentiellement moins fluide. La course comparative conserve un pas de simulation par image. |
| **Voitures par génération** | 20–100, par pas de 10 ; initialement 50 | Définit l’effectif des générations. Le changement relance l’entraînement. |
| **Taux de croisement** | 0–100 %, par pas de 5 ; initialement 70 % | Probabilité qu’un descendant soit issu du croisement de deux parents plutôt que de la copie d’un seul. 0 % : mutation seule. S’applique à la génération suivante, sans relancer l’entraînement. |
| **Taux de mutation** | 1–50 % ; initialement 15 % | Probabilité qu’un poids ou biais soit perturbé lors de la mutation d’un descendant. Valeur plus élevée : davantage d’exploration, mais aussi plus de variation. |
| **Seuil de réussite** | 40–100 %, par pas de 5 ; initialement 60 % | Pourcentage minimal de voitures qui doivent terminer le circuit avant l’arrêt automatique de l’entraînement. |
| **Graine aléatoire** | Entier de 0 à 4 294 967 295 ; vide = automatique (défaut) | Fixe le hasard de l’évolution (poids initiaux, mutations, croisements, tournois, léger décalage des départs). Valider une graine relance l’entraînement depuis la génération 0 ; vide : une graine est tirée à chaque nouvelle expérience. La graine en cours s’affiche sous le champ et dans le HUD. Le bouton **Rejouer** fige la graine en cours dans le champ et relance. Une saisie invalide est refusée avec un message. |
| **Neurones cachés** | 4–64 ; initialement 20 | Taille de la couche cachée. Changer cette architecture relance l’entraînement. |
| **Activation de la couche cachée** | Sigmoïde, tanh ou ReLU ; initialement sigmoïde | Fonction non linéaire appliquée dans la couche cachée. Le changement relance l’entraînement. |
| **Circuit** | Débutant, intermédiaire, expert ou circuit dessiné | Sélectionne une géométrie et relance la génération. Choisir un circuit dessiné sans piste enregistrée ouvre l’éditeur. Grisé quand l’entraînement multi-circuits est actif. |
| **Entraîner sur plusieurs circuits** | Décoché par défaut | Chaque génération court plusieurs circuits au lieu d’un seul (section 10). Le changement relance l’entraînement. |
| **Circuits d’entraînement** | Débutant, intermédiaire, expert ; les trois cochés par défaut | Visible seulement en mode multi-circuits. Au moins un circuit reste coché (la dernière case est verrouillée). Le changement relance l’entraînement. |
| **Circuit de la course** | Celui de l’entraînement (défaut), débutant, intermédiaire, expert ou circuit dessiné | Circuit sur lequel se déroule la prochaine course, sans toucher à l’entraînement en cours (section 13). |
| **Complexité des virages** | 1–50 ; initialement 12 | Modifie les ondulations du tracé prédéfini. Le changement reconstruit le circuit et relance l’entraînement. |
| **Largeur de piste** | 35–150 pixels, par pas de 5 ; initialement 100 | Modifie la distance entre les bordures intérieures et extérieures. Le changement reconstruit le circuit et relance l’entraînement. |
| **Debug des capteurs et distances** | Désactivé par défaut | Affiche les rayons, distances, checkpoints et repères de diagnostic ; ne modifie pas l’apprentissage. |
| **Son & effets** | Sons activés, volume de 0 à 100 % (50 % par défaut), effets visuels activés | Panneau « Son & effets » et bouton 🔊/🔇 de la barre supérieure (section 17). Purement cosmétiques : aucun effet sur l’apprentissage ni sur la graine. |

**Réglages conservés entre les sessions :** les valeurs des curseurs, la graine imposée (le champ vide = automatique), l’activation, le circuit prédéfini, l’option multi-circuits et ses cases, le circuit de la course (hors circuit dessiné) et l’option de debug sont enregistrées dans le navigateur (`localStorage`) à chaque modification, puis rétablies au prochain chargement de la page. Une valeur enregistrée absente, hors bornes ou illisible est ignorée et la valeur par défaut est conservée ; si le navigateur refuse le stockage, l’application fonctionne normalement sans mémoriser les réglages. Le circuit dessiné à la main n’est pas conservé : le dernier circuit prédéfini choisi est alors rétabli. L’état Pause et l’affichage des panneaux ne sont pas mémorisés. Les préférences de son et d’effets sont enregistrées à part (section 17).

Les modifications de vitesse, de force, de cycles, de mutation et de seuil ne changent pas l’architecture du réseau. En revanche, changer le nombre de neurones, l’activation, la population ou la géométrie du circuit redémarre l’entraînement en cours. Avant ce redémarrage, les cinq meilleurs cerveaux ayant progressé sont archivés (section 12). Les cerveaux déjà conservés dans le navigateur restent distincts de la génération en cours.

### Reproduire une expérience et comparer deux réglages

Sans graine fixe, deux entraînements avec les mêmes curseurs divergent, et une différence de résultat peut venir du hasard autant que du réglage. Avec la graine :

1. Lance un entraînement (graine automatique) : la graine tirée s’affiche sous le champ **Graine aléatoire** et dans le HUD.
2. Clique sur **Rejouer** : la graine est figée dans le champ et l’expérience repart du début. Avec les mêmes réglages, elle se déroule à l’identique (mêmes voitures au départ, mêmes générations, mêmes scores).
3. Change **un seul** réglage (taux de mutation, de croisement, circuit…), puis valide ou clique sur **Rejouer** : la nouvelle expérience part du même point de départ.
4. Répète avec plusieurs graines. Une seule graine ne prouve pas qu’un réglage est meilleur : elle garantit seulement que la comparaison n’est pas faussée par un départ différent. Le nom du fichier de l’export CSV de la courbe contient la graine.

Ce qui est couvert : tous les tirages de l’évolution. Ce qui ne l’est pas : le hasard des identifiants de l’archive des cerveaux (sans effet sur la simulation) et le moment où l’on clique ; la graine n’est pas enregistrée dans les cerveaux archivés. Mettre en pause, lancer une course, importer des cerveaux ou cliquer sur **Continuer l’évolution** ne changent pas le déroulement de l’expérience : la graine n’est réappliquée qu’au démarrage et à chaque relance de l’entraînement.

Conditions pour retrouver exactement la même expérience : les mêmes réglages, la même taille de fenêtre (le circuit en dépend), et le même navigateur et la même machine (les calculs en virgule flottante de TensorFlow.js peuvent différer légèrement d’un matériel à l’autre, ce qui suffit à faire diverger une évolution).

## 10. Circuits et dessin d’un tracé

### Circuits prédéfinis

- **Débutant · ovale fluide :** tracé régulier avec de faibles ondulations.
- **Intermédiaire · virages alternés :** forme plus sinueuse avec alternance de courbes.
- **Expert · tracé technique :** combinaison de variations géométriques plus fréquentes.

Les circuits prédéfinis sont générés à partir de points autour d’une forme fermée, interpolés puis rééchantillonnés. Le programme calcule une ligne centrale, deux bordures décalées selon la normale locale, des segments de mur et des checkpoints transversaux. Il ajuste le tracé à la taille disponible et place une ligne de départ ainsi que la direction initiale.

### Dessiner un circuit personnalisé

1. Cliquer sur **Dessiner un circuit**. L’entraînement est mis en pause et une barre d’édition apparaît.
2. Maintenir le bouton de la souris et tracer une boucle suffisamment longue dans le canvas. Le tracé est refermé automatiquement ; si le trait dépasse un peu son point de départ, le petit bout en trop est retiré et la boucle est refermée proprement.
3. Cliquer sur **Terminer le circuit** pour générer la piste, ses bordures et ses checkpoints, puis reprendre l’entraînement sur cette nouvelle géométrie.
4. Cliquer sur **Annuler** pour abandonner le dessin et restaurer l’état précédent de l’entraînement.
5. Utiliser **Réinitialiser l’éditeur** pour revenir au circuit débutant ; une confirmation est demandée lorsqu’un circuit personnalisé existe.

Pendant le dessin, les clics hors du canvas sont ignorés (un clic sur « Terminer le circuit » n’ajoute donc pas de point) et les points à moins de 7 pixels du précédent sont filtrés. Au moment de terminer, le tracé est refusé, avec un message affiché dans la barre d’édition, dans trois cas : il compte moins de 16 points, il couvre moins de 1,5 % de la surface de la fenêtre, ou il se recoupe lui-même. Un croisement unique près de la jonction (dépassement du point de départ) est corrigé automatiquement ; un croisement au milieu du tracé, comme une boucle en « 8 », est refusé : cliquer sur **Annuler** puis redessiner une boucle sans croisement. La piste acceptée est lissée, rééchantillonnée et mise à l’échelle avant que les voitures soient recréées.

### Entraînement sur plusieurs circuits

Un cerveau entraîné sur un seul tracé risque de ne savoir conduire que sur celui-là. Cocher **Entraîner sur plusieurs circuits** change la définition d’une génération :

```text
tour 1 (débutant) → tour 2 (intermédiaire) → tour 3 (expert) → fitness moyenne → sélection → génération suivante
```

- Chaque génération comporte un **tour par circuit coché**, toujours dans l’ordre débutant → intermédiaire → expert. Les mêmes cerveaux repartent à chaque tour avec de nouvelles voitures, au départ du circuit courant, avec le même petit décalage de départ (l’élite rejoue donc exactement les mêmes départs d’un circuit à l’autre).
- Le **score** et la **fitness** d’une voiture sont la **moyenne de ses tours**. Un cerveau excellent sur un circuit et nul sur les autres ne domine donc pas la sélection.
- Une voiture n’est « réussie » (donc comptée dans le **seuil de réussite**) que si elle a **bouclé tous les circuits cochés**.
- La fitness agrégée n’est pas recalculée sur le dernier circuit : elle est conservée telle quelle jusqu’à la sélection (élitisme et tournoi se font sur la moyenne).
- Le numéro de génération n’avance qu’après le dernier tour. Le HUD indique le circuit en cours (« Circuit de la génération : 2 / 3 ») et le fond de piste change à chaque tour. La courbe d’apprentissage et l’export CSV portent sur les moyennes de génération (fichier `courbe-apprentissage-multi-circuits.csv`).
- Une génération dure autant de tours que de circuits cochés : à effectif égal, l’entraînement est environ deux à trois fois plus long par génération.
- Les cerveaux archivés gardent la liste des circuits d’entraînement (`trainedOn`, voir ARCHITECTURE.md §10.2). La liste des cerveaux l’affiche (« entraîné : débutant », « entraîné : 3 circuits »).
- Dessiner un circuit en mode multi-circuits n’interrompt pas l’entraînement : le circuit dessiné devient le circuit de la course, idéal comme circuit inédit.

## 11. Suivi des résultats et inspection du réseau

- **HUD :** indique le mode courant, le circuit, le temps écoulé (en course : le chronomètre de la course), la vitesse moyenne, les voitures encore en vie, les scores, le nombre de cycles par image, la graine de l’expérience et, en multi-circuits, le circuit de la génération. Les statistiques sont rafraîchies périodiquement plutôt qu’à chaque image.
- **Courbe d’apprentissage :** affiche le score moyen et le meilleur score par génération. L’historique conservé dans la session est limité aux 250 générations les plus récentes. Le bouton **Exporter la courbe (CSV)** du panneau télécharge ces données (`courbe-apprentissage-<circuit>.csv`, avec le suffixe `-graine-<n>` lorsqu’une graine est active) pour les réutiliser dans le rapport : colonnes `generation`, `score_moyen`, `meilleur_score`, `vitesse_moyenne`, `duree_s` ; séparateur virgule, point décimal. Le bouton reste désactivé tant qu’aucune génération n’est terminée.
- **Réseau du meilleur agent :** représente les couches, les connexions et leurs poids. La couleur distingue les poids positifs et négatifs ; l’épaisseur et l’opacité traduisent leur amplitude relative. Le survol d’une connexion affiche son poids, et le survol d’un neurone affiche son libellé et, pour les couches concernées, son biais.
- **Panneaux repliables :** les visualisations ne sont actualisées que lorsqu’elles sont ouvertes, afin d’éviter des opérations de rendu inutiles en permanence.
- **Mise en évidence du meilleur agent :** le meilleur candidat actif est choisi à partir de la fitness et, en cas d’égalité, de la distance au prochain checkpoint. Il est mis en évidence dans le canvas.
- **Rendu visuel :** les voitures sont dessinées en monoplaces (ailerons, roues, cockpit, feux de freinage qui s’allument quand elles ralentissent) ; le leader a un halo pulsé et une traînée lumineuse. Le circuit (herbe, asphalte, vibreurs, ligne d’arrivée avec portique, arbres, pins, buissons, rochers, fleurs) est peint une seule fois dans un calque puis recopié à chaque image ; le décor est déterministe (même circuit, même décor). Il est purement visuel : les collisions utilisent les murs, jamais le décor.

La courbe décrit les scores observés au cours de l’exécution actuelle ; elle ne constitue pas une garantie de convergence. Les poids affichés permettent d’inspecter la structure et les signes des connexions, mais ne suffisent pas à expliquer seuls une décision particulière : les activations dépendent aussi des entrées reçues.

## 12. Archiver, sauvegarder et restaurer les cerveaux

### Archivage dans le navigateur

Les **trois meilleurs cerveaux** sont ajoutés automatiquement à l’archive à la fin de chaque génération, parmi ceux qui ont validé au moins un checkpoint ou terminé le tour : un cerveau qui n’a rien accompli ne remplit pas l’archive. **Archiver le top** enregistre les cinq meilleurs candidats disponibles au moment du clic, sans ce filtre. L’archive est conservée dans le stockage local du navigateur, pour l’origine utilisée, et contient au maximum **40 cerveaux**. Les nouveaux enregistrements sont placés en tête de liste ; si la limite est dépassée, les entrées les plus anciennes sortent de l’archive.

Les données comprennent notamment le score, la fitness, la génération, la piste utilisée, les circuits d’entraînement (`trainedOn`), les paramètres physiques et le JSON du réseau (architecture, activation, poids et biais). Elles survivent à un rechargement de la page dans le même navigateur et sur la même origine. Effacer les données du navigateur ou changer d’origine peut rendre cette copie locale inaccessible : exporter périodiquement une sauvegarde JSON pour la conserver séparément.

### Exporter et importer

- Cliquer sur **Exporter JSON** pour télécharger l’archive dans `neuroevolution-cerveaux.json`.
- Cliquer sur **Importer JSON**, puis choisir une archive exportée précédemment. Les entrées importées sont validées et fusionnées avec l’archive locale ; les identifiants identiques ne sont pas dupliqués et la limite de 40 entrées est respectée.
- Cliquer sur **Effacer tous les cerveaux enregistrés** et confirmer pour vider l’archive du navigateur. Cette action ne supprime pas les fichiers JSON exportés ; elle supprime aussi la copie de sauvegarde d’une archive abîmée.

Un fichier importé invalide ou dont les poids ont un format incorrect est refusé avec un message d’erreur. Si l’archive locale elle-même est abîmée (JSON illisible, entrée invalide), l’application la répare au démarrage : seules les entrées valides sont conservées et une copie brute des données d’origine est gardée dans le navigateur avant toute réécriture ; un message l’annonce. Chaque écriture est relue et vérifiée, et l’ancienne valeur est restaurée en cas d’échec (espace insuffisant, par exemple) : une écriture ratée ne laisse jamais une archive à moitié écrite.

## 13. Organiser une course comparative

1. Laisser l’entraînement terminer au moins une génération ou cliquer sur **Archiver le top** afin de disposer de cerveaux.
2. Dans la liste **Cerveaux entraînés**, cocher un ou plusieurs cerveaux. **Tout sélectionner** permet de sélectionner ou désélectionner toute l’archive.
3. Choisir le **Circuit de la course** (voir ci-dessous), puis cliquer sur **Lancer la course**. Les agents sélectionnés partent du même point et utilisent les réglages physiques actuels ; l’entraînement est suspendu pendant la comparaison.
4. Observer les voitures, leur progression, les checkpoints et le HUD. Le bandeau en haut de l’écran affiche le chronomètre de la course (au centième de seconde) et le classement en direct : les voitures arrivées sont classées au temps de tour croissant, avec leur écart au premier ; les autres voitures suivent, classées par score puis par proximité du checkpoint visé, et marquées « en piste » ou « sortie ». Deux voitures arrivées avec le même temps partagent le même rang.
5. À la fin, les premiers résultats, avec leur temps d’arrivée, sont affichés sous la liste et le classement du bandeau reste visible. Cliquer sur **Retour à l’entraînement** pour quitter la course et restaurer l’état d’entraînement précédent.

### Vérifier la généralisation : une course sur un autre circuit

Le sélecteur **Circuit de la course** est indépendant de l’entraînement. Par défaut (« Celui de l’entraînement »), la course se déroule sur le circuit courant. En choisissant un autre circuit prédéfini, ou le circuit dessiné, la course se déroule sur ce circuit **sans relancer l’entraînement** : la population, la génération et la courbe sont conservées, et **Retour à l’entraînement** redessine exactement le circuit d’entraînement.

Pour chaque cerveau, l’application compare les circuits sur lesquels il a été entraîné au circuit de la course :

- **connu** : le cerveau a roulé sur ce circuit pendant son entraînement ;
- **inédit** : il ne l’a jamais vu, c’est le vrai test ;
- aucune étiquette si l’archive est ancienne et sans historique (cerveau importé avant cette fonction, par exemple).

L’étiquette est écrite en toutes lettres à côté du nom dans le classement ; le bandeau précise le circuit et la répartition (« Circuit : expert · inédit pour 3 cerveau(x) · déjà vu par 2 »), et le bilan sous la liste indique combien de cerveaux ont bouclé le tour dans chaque catégorie (« circuit inédit : 1/3 ont bouclé le tour »).

**Protocole conseillé :** décocher un circuit d’entraînement (par exemple l’expert) ou dessiner son propre circuit, entraîner jusqu’au seuil de réussite, archiver, puis courir sur le circuit mis de côté. Pour mesurer l’intérêt du multi-circuits, comparer avec des cerveaux entraînés sur un seul circuit, courus sur ce même circuit inédit. Un seul essai ne prouve rien : l’apprentissage est stochastique et plusieurs entraînements sont nécessaires pour conclure.

Une course utilise un pas de simulation par image ; le réglage de cycles par image concerne l’entraînement et ne multiplie pas les pas de course. Le chronomètre compte ces images simulées (60 images = 1 seconde de course), et non l’horloge du navigateur : il s’arrête quand toutes les voitures sont hors course et reste comparable d’un ordinateur à l’autre. Si l’affichage ne tient pas 60 images par seconde, la course paraît plus lente à l’écran, mais les temps de tour restent justes.

## 14. Configuration et lancement du projet

### Prérequis

- Un navigateur récent compatible avec Canvas, JavaScript et `localStorage`.
- Une connexion Internet pour télécharger p5.js et TensorFlow.js depuis jsDelivr.
- **Node.js 18 ou une version ultérieure** uniquement pour exécuter la suite de tests.

Il n’y a pas de compilation ni d’installation de paquets nécessaire pour lancer l’application.

### Lancer avec un serveur HTTP local (recommandé)

Depuis PowerShell, se placer dans le dossier de l’exercice et démarrer le serveur :

```powershell
cd "Conduite Évolutive"
py -m http.server 8000
```

Si la commande `py` n’est pas disponible, essayer :

```powershell
python -m http.server 8000
```

Ouvrir ensuite **http://localhost:8000** dans le navigateur. Laisser la fenêtre du serveur ouverte pendant l’utilisation ; `Ctrl+C` l’arrête. Il est aussi possible d’ouvrir [index.html](./Conduite%20Évolutive/index.html) directement, mais un serveur HTTP local fournit une origine stable pour l’archive `localStorage` et constitue la méthode conseillée.

### Premiers essais conseillés

1. Conserver les réglages initiaux et laisser une génération se terminer.
2. Activer le debug pour observer les mesures faites par les rayons.
3. Ouvrir la courbe d’apprentissage et le diagramme du meilleur agent.
4. Archiver le top, puis lancer une course comparative entre plusieurs cerveaux.
5. Modifier un paramètre à la fois pour comparer son effet. Garder à l’esprit que les poids initiaux et les mutations sont aléatoires : une seule exécution ne permet pas de conclure qu’un réglage est systématiquement supérieur.

## 15. Tests automatisés et résultats

Depuis le dossier `Conduite Évolutive`, exécuter :

```powershell
node --test tests/*.test.cjs
```

**Résultat mesuré le 18 octobre 2026 avec Node.js v22.22.2 : 246 tests réussis, 0 échec, 0 test ignoré**, répartis en 23 fichiers, durée rapportée par le lanceur : environ 4 s.

La suite couvre notamment :

- création, copie, mutation, prédiction, sérialisation et validation des cerveaux ;
- sauvegarde, plafonnement à 40 entrées, import, export et effacement de l’archive ;
- effet de la progression, de la vitesse, de la stagnation et de la conduite à contresens sur la fitness ;
- évolution et recul de la progression sur le circuit ;
- nombre de cycles par image, pause et séparation du mode course ;
- limites de vitesse et de force, valeurs des entrées des capteurs et géométrie des circuits ;
- circuit personnalisé, limites du canvas, checkpoints et aménagement intérieur ;
- entraînement multi-circuits : enchaînement des tours, agrégation des résultats, départs conservés, élite, reprise, redémarrage ;
- course sur un autre circuit : dessin du circuit sans toucher à l’entraînement, restauration exacte, étiquettes « connu » / « inédit », archives anciennes, circuit dessiné absent ;
- réglages mémorisés du multi-circuits et cohérence de `index.html` ;
- graine aléatoire (`tests/random-seed.test.cjs`) : valeurs de référence du générateur, validation de la saisie, reproductibilité des poids initiaux, des mutations, des croisements, des tournois et du départ de `Car`, expérience complète rejouée à l’identique, départ identique quand un seul réglage change, champ de saisie, bouton « Rejouer », HUD et réglages mémorisés.

- fin de vie des voitures : collision balayée (une voiture rapide ne saute pas un mur), rectangle orienté de la voiture, stagnation sur place et rotation en cercle ;
- éditeur de circuit : clics hors canvas ignorés, fermeture automatique d’un dépassement, refus d’un tracé qui se recoupe ;
- archivage filtré (voitures sans progression ignorées), compteur de génération et cohérence des valeurs initiales avec la page ;
- rendu : décor déterministe et contenu dans le canvas, calque mis en cache, couleurs, voiture, halo, traînée et feux de freinage ;
- sons et effets (`tests/sound-effects.test.cjs`, 36 tests) : préférences, déverrouillage par geste, plafond de voix et limitation de fréquence, volume, moteur, particules, reproductibilité, aucune utilisation du générateur à graine.

Ces tests utilisent des adaptateurs légers pour certaines API de navigateur (DOM, stockage, Web Audio), p5.js et TensorFlow.js. Ils vérifient les fonctions et règles testées côté JavaScript, mais ne remplacent pas une validation visuelle dans un navigateur réel. Aucun temps de tour, taux de réussite expérimental ni nombre de générations avant convergence n’est revendiqué ici : ces mesures varient avec l’aléatoire, la piste et les paramètres.

## 16. Limites et précautions d’interprétation

- L’apprentissage est stochastique. Avec une graine automatique, deux exécutions avec les mêmes curseurs peuvent produire des trajectoires différentes ; avec la même graine et les mêmes réglages, elles se rejouent à l’identique (section 9), sous réserve de la même fenêtre, du même navigateur et de la même machine. Dès qu’un réglage diffère, l’évolution diverge : comparer plusieurs graines avant de conclure.
- La reproductibilité par graine est validée par des tests Node avec adaptateurs. Elle n’a pas été mesurée dans un navigateur réel (initialiseurs à graine de TensorFlow.js, p5.js).
- Les capteurs ne voient les murs que dans un rayon limité et un champ de vision de 120°. Ils ne fournissent pas une carte complète du circuit.
- La qualité des résultats dépend du circuit, de la taille de population, de l’architecture et du temps laissé à l’entraînement.
- Les curseurs qui modifient l’architecture ou la piste réinitialisent la génération en cours. Il convient d’archiver les cerveaux utiles avant de changer plusieurs paramètres.
- `localStorage` est une archive locale au navigateur et à l’origine, pas une sauvegarde distante. L’export JSON est nécessaire pour transférer ou préserver des résultats hors de cette origine.
- Entraîner sur plusieurs circuits n’est pas une garantie de généralisation : un circuit coché est un circuit connu. Seul un circuit laissé de côté (décoché ou dessiné) est un test honnête, et une seule course reste un échantillon.
- En multi-circuits, la moyenne peut masquer un échec complet sur un circuit ; le seuil de réussite, lui, exige de boucler tous les circuits cochés. Les circuits d’entraînement sont limités aux trois circuits prédéfinis (le circuit dessiné sert de circuit de course).
- Le « Archiver le top » manuel en cours de génération enregistre les circuits cochés comme circuits d’entraînement, même si la génération n’a couru qu’une partie de ses tours.
- Les sons et effets sont validés avec une API Web Audio simulée : le rendu sonore réel, le volume perçu et la compatibilité des navigateurs n’ont pas été mesurés. Il en va de même du rendu visuel (décor, voitures, particules), qui demande un essai dans un navigateur réel.
- La suite automatisée ne mesure pas la performance réelle des agents et ne valide pas à elle seule le rendu ou le chargement des CDN dans tous les navigateurs.

## 17. Sons et effets

Tout est synthétisé (Web Audio, aucun fichier audio) et purement cosmétique : sons et effets lisent l’état de la simulation sans jamais le modifier, et n’utilisent jamais le générateur à graine (`Random.js`) : une expérience reste reproductible, sons et effets activés ou non.

| Événement | Son | Effet visuel |
| --- | --- | --- |
| Moteur de la voiture de tête | grave → aigu selon la vitesse | – |
| Collision / sortie de piste | impact + choc sourd | onde de choc, étincelles, débris, fumée |
| Dérapage de la voiture de tête (virage serré à vitesse élevée) | crissement | fumée de pneus |
| Checkpoint validé par la tête | tic discret | flash de la porte |
| Arrivée d’une voiture | arpège | confettis |
| Nouvelle génération | petit bip montant | – |
| Objectif atteint | fanfare | confettis + flash vert |
| Lancement d’une course | trois bips puis un aigu | – |
| Bascule du son, réglage du volume | clic discret | – |

- Le navigateur interdit le son avant un geste de l’utilisateur : l’audio démarre au premier clic ou à la première touche.
- Bouton 🔊/🔇 dans la barre supérieure, ou section « Son & effets » du panneau : son, volume, effets visuels. Les préférences sont enregistrées (`neuroRacingSoundPrefs`), à part des réglages de simulation.
- Couper le son arrête le moteur et libère ses nœuds audio ; l’onglet masqué suspend l’audio.
- Entraînement accéléré (cycles par image ≥ 3) : les sons de collision et de nouvelle génération sont coupés, et seules les collisions de la voiture de tête ont des étincelles. En course, ce réglage n’a pas d’effet.
- Seules les éliminations par choc (mur ou sortie du canvas) déclenchent les effets de collision ; une élimination pour stagnation ou contresens reste silencieuse.
- Les sons ponctuels sont limités à 16 voix simultanées et à une fréquence maximale par type ; les particules sont plafonnées à 600.
- Les particules sont du décor : elles ne sont pas des entités simulées (aucune interaction avec les voitures ou les murs).

## 18. Conclusion

Neuro Racing propose une démonstration intégrée de la perception et de la commande par réseau neuronal, associée à une évolution fondée sur la sélection et la mutation. La simulation rend visibles les observations des voitures, la géométrie de la piste, l’évolution des scores et les paramètres des réseaux. L’éditeur de circuit, les contrôles d’entraînement, l’archive persistante et les courses comparatives permettent de transformer une démonstration en environnement d’expérimentation.

Le projet met également en évidence une idée importante : un agent ne s’améliore pas parce qu’un réseau est simplement plus grand ou qu’un taux de mutation est plus élevé. La qualité des observations, la fonction de fitness, les contraintes de déplacement, le circuit et les réglages interagissent. Les outils de diagnostic et les tests fournissent des moyens de vérifier le fonctionnement du programme, tandis que l’évaluation des performances d’apprentissage doit être menée par des expériences répétées et comparables.
