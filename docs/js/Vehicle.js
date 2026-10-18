class Vehicle {
    constructor(position, velocity, maxSpeed, maxForce) {
        this.pos = position.copy();
        this.vel = velocity.copy();
        this.acc = createVector(0, 0);
        this.maxSpeed = maxSpeed;
        this.maxForce = maxForce;
    }

    applyForce(force) {
        this.acc.add(force);
    }

    update() {
        if (this.dead) return;

        this.vel.add(this.acc);
        this.vel.limit(this.maxSpeed);
        this.pos.add(this.vel);
        this.acc.mult(0);
    }
}
