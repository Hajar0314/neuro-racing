// Réseau dont les poids vont être écrasés juste après (copie, import JSON) : son initialisation
// n'a aucune importance et ne doit surtout pas consommer le flux aléatoire de la simulation.
const NO_INIT_SEEDS = [null, null];

class NeuralNetwork {
    constructor(inputNodes, hiddenNodes, outputNodes, activation = "sigmoid", model = null, initSeeds = undefined) {
        this.input_nodes = inputNodes;
        this.hidden_nodes = hiddenNodes;
        this.output_nodes = outputNodes;
        this.activation = activation;
        this.model = model || this.createModel(initSeeds);
    }

    // initSeeds = [graine couche cachée, graine couche de sortie]. Par défaut, elles sont tirées dans
    // le flux de la simulation (Random.js) : un même départ donne alors les mêmes poids initiaux.
    // Une graine null laisse TensorFlow.js initialiser cette couche comme d'habitude.
    createModel(initSeeds = [nextInitSeed(), nextInitSeed()]) {
        const [hiddenSeed, outputSeed] = initSeeds;
        const model = tf.sequential();

        const hiddenLayer = {
            units: this.hidden_nodes,
            inputShape: [this.input_nodes],
            activation: this.activation
        };
        if (hiddenSeed !== null) hiddenLayer.kernelInitializer = tf.initializers.glorotUniform({ seed: hiddenSeed });
        model.add(tf.layers.dense(hiddenLayer));

        const outputLayer = {
            units: this.output_nodes,
            activation: "sigmoid"
        };
        if (outputSeed !== null) outputLayer.kernelInitializer = tf.initializers.glorotUniform({ seed: outputSeed });
        model.add(tf.layers.dense(outputLayer));

        return model;
    }

    dispose() {
        this.model.dispose();
    }

    predict(inputs) {
        return tf.tidy(() => {
            const xs = tf.tensor2d([inputs]);
            const ys = this.model.predict(xs);
            return Array.from(ys.dataSync());
        });
    }

    copy() {
        const modelCopy = this.createModel(NO_INIT_SEEDS);
        const weights = this.model.getWeights();
        const weightCopies = weights.map(weight => weight.clone());
        try {
            modelCopy.setWeights(weightCopies);
        } catch (error) {
            modelCopy.dispose();
            throw error;
        } finally {
            weightCopies.forEach(weight => weight.dispose());
        }
        return new NeuralNetwork(
            this.input_nodes,
            this.hidden_nodes,
            this.output_nodes,
            this.activation,
            modelCopy
        );
    }

    mutate(rate) {
        tf.tidy(() => {
            const weights = this.model.getWeights();
            const mutatedWeights = [];

            for (let i = 0; i < weights.length; i++) {
                let tensor = weights[i];
                let shape = weights[i].shape;
                let values = tensor.dataSync().slice(); // Copie des valeurs

                for (let j = 0; j < values.length; j++) {
                    if (randomUnit() < rate) {
                        values[j] += randomGaussianValue(0, 0.1);
                    }
                }

                let newTensor = tf.tensor(values, shape);
                mutatedWeights[i] = newTensor;
            }

            this.model.setWeights(mutatedWeights);
        });
    }

    // Croisement de deux parents de même architecture, par neurone caché : chaque neurone est
    // hérité d'un seul parent, tiré au hasard, avec ses poids d'entrée, son biais et ses poids
    // de sortie (un neurone reste ainsi une unité cohérente). Le biais de chaque sortie est lui
    // aussi tiré au hasard. Les parents ne sont pas modifiés ; l'enfant est un nouveau réseau
    // que l'appelant doit libérer (dispose). Architecture différente : copie du premier parent.
    static crossover(parentA, parentB) {
        const child = parentA.copy();
        const sameArchitecture = parentA.input_nodes === parentB.input_nodes &&
            parentA.hidden_nodes === parentB.hidden_nodes &&
            parentA.output_nodes === parentB.output_nodes;
        if (!sameArchitecture) return child;

        const inputs = parentA.input_nodes;
        const hidden = parentA.hidden_nodes;
        const outputs = parentA.output_nodes;
        tf.tidy(() => {
            const fromB = parentB.model.getWeights().map(weight => weight.dataSync());
            const childWeights = child.model.getWeights();
            const shapes = childWeights.map(weight => [...weight.shape]);
            // [entrée → cachée, biais cachés, cachée → sortie, biais de sortie]
            const values = childWeights.map(weight => weight.dataSync().slice());

            for (let neuron = 0; neuron < hidden; neuron++) {
                if (randomUnit() >= 0.5) continue;
                for (let input = 0; input < inputs; input++) {
                    values[0][input * hidden + neuron] = fromB[0][input * hidden + neuron];
                }
                values[1][neuron] = fromB[1][neuron];
                for (let output = 0; output < outputs; output++) {
                    values[2][neuron * outputs + output] = fromB[2][neuron * outputs + output];
                }
            }
            for (let output = 0; output < outputs; output++) {
                if (randomUnit() < 0.5) values[3][output] = fromB[3][output];
            }
            child.model.setWeights(values.map((array, index) => tf.tensor(array, shapes[index])));
        });
        return child;
    }

    toJSON() {
        const tensors = this.model.getWeights();
        let weights;
        weights = tensors.map(weight => ({
            shape: [...weight.shape],
            values: Array.from(weight.dataSync())
        }));

        return {
            inputNodes: this.input_nodes,
            hiddenNodes: this.hidden_nodes,
            outputNodes: this.output_nodes,
            activation: this.activation,
            weights
        };
    }

    static fromJSON(data) {
        NeuralNetwork.validateJSON(data);
        const network = new NeuralNetwork(
            data.inputNodes,
            data.hiddenNodes,
            data.outputNodes,
            data.activation,
            null,
            NO_INIT_SEEDS
        );
        const tensors = data.weights.map(weight => tf.tensor(weight.values, weight.shape));
        try {
            network.model.setWeights(tensors);
        } catch (error) {
            network.dispose();
            throw error;
        } finally {
            tensors.forEach(tensor => tensor.dispose());
        }
        return network;
    }

    static validateJSON(data) {
        if (!data || !Number.isInteger(data.inputNodes) || data.inputNodes < 1 ||
            !Number.isInteger(data.hiddenNodes) || data.hiddenNodes < 1 ||
            !Number.isInteger(data.outputNodes) || data.outputNodes < 1 ||
            !["sigmoid", "tanh", "relu"].includes(data.activation) ||
            !Array.isArray(data.weights) || data.weights.length !== 4) {
            throw new Error("Format de cerveau invalide.");
        }

        const expectedShapes = [
            [data.inputNodes, data.hiddenNodes],
            [data.hiddenNodes],
            [data.hiddenNodes, data.outputNodes],
            [data.outputNodes]
        ];

        data.weights.forEach((weight, index) => {
            const shapeMatches = Array.isArray(weight.shape) &&
                weight.shape.length === expectedShapes[index].length &&
                weight.shape.every((value, dimension) => value === expectedShapes[index][dimension]);
            const sizeMatches = Array.isArray(weight.values) &&
                weight.values.length === expectedShapes[index].reduce((size, value) => size * value, 1);
            if (!shapeMatches || !sizeMatches ||
                weight.values.some(value => !Number.isFinite(value))) {
                throw new Error("Poids de cerveau invalides.");
            }
        });
    }
}
