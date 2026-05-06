// Snake Game Implementation with Debug Support
class SnakeGame {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        
        // Game Constants
        this.gridSize = 20;
        this.tileCount = this.canvas.width / this.gridSize;
        
        // Game State
        this.snake = [{ x: 10, y: 10 }];
        this.direction = { x: 1, y: 0 };
        this.nextDirection = { x: 1, y: 0 };
        this.food = this.generateFood();
        this.score = 0;
        this.level = 1;
        this.gameRunning = false;
        this.gamePaused = false;
        this.gameOver = false;
        
        // Speed Management
        this.baseSpeed = 100;
        this.speed = this.baseSpeed;
        this.gameLoopId = null;
        
        // Debug logging
        this.logs = [];
        this.maxLogs = 50;
        
        // Setup event listeners
        this.setupControls();
        this.addLog('Game initialized');
    }
    
    generateFood() {
        let newFood;
        let valid = false;
        
        while (!valid) {
            newFood = {
                x: Math.floor(Math.random() * this.tileCount),
                y: Math.floor(Math.random() * this.tileCount)
            };
            
            // Ensure food doesn't spawn on snake
            valid = !this.snake.some(segment => 
                segment.x === newFood.x && segment.y === newFood.y
            );
        }
        
        return newFood;
    }
    
    setupControls() {
        document.addEventListener('keydown', (e) => {
            if (!this.gameRunning) return;
            
            // Arrow keys
            if (e.key === 'ArrowUp' && this.direction.y === 0) {
                this.nextDirection = { x: 0, y: -1 };
                e.preventDefault();
            } else if (e.key === 'ArrowDown' && this.direction.y === 0) {
                this.nextDirection = { x: 0, y: 1 };
                e.preventDefault();
            } else if (e.key === 'ArrowLeft' && this.direction.x === 0) {
                this.nextDirection = { x: -1, y: 0 };
                e.preventDefault();
            } else if (e.key === 'ArrowRight' && this.direction.x === 0) {
                this.nextDirection = { x: 1, y: 0 };
                e.preventDefault();
            }
            
            // WASD keys
            if (e.key.toLowerCase() === 'w' && this.direction.y === 0) {
                this.nextDirection = { x: 0, y: -1 };
            } else if (e.key.toLowerCase() === 's' && this.direction.y === 0) {
                this.nextDirection = { x: 0, y: 1 };
            } else if (e.key.toLowerCase() === 'a' && this.direction.x === 0) {
                this.nextDirection = { x: -1, y: 0 };
            } else if (e.key.toLowerCase() === 'd' && this.direction.x === 0) {
                this.nextDirection = { x: 1, y: 0 };
            }
        });
    }
    
    start() {
        if (this.gameRunning) return;
        
        this.gameRunning = true;
        this.gamePaused = false;
        this.gameOver = false;
        this.addLog('Game started');
        this.updateUI();
        this.gameLoop();
    }
    
    pause() {
        if (!this.gameRunning || this.gameOver) return;
        
        this.gamePaused = !this.gamePaused;
        this.addLog(`Game ${this.gamePaused ? 'paused' : 'resumed'}`);
        
        if (!this.gamePaused) {
            this.gameLoop();
        }
        
        this.updateUI();
    }
    
    reset() {
        clearTimeout(this.gameLoopId);
        
        this.snake = [{ x: 10, y: 10 }];
        this.direction = { x: 1, y: 0 };
        this.nextDirection = { x: 1, y: 0 };
        this.food = this.generateFood();
        this.score = 0;
        this.level = 1;
        this.speed = this.baseSpeed;
        this.gameRunning = false;
        this.gamePaused = false;
        this.gameOver = false;
        
        this.addLog('Game reset');
        this.updateUI();
        this.draw();
    }
    
    gameLoop() {
        if (this.gamePaused || this.gameOver) return;
        
        // Update game state
        this.update();
        
        // Draw
        this.draw();
        
        // Schedule next frame
        this.gameLoopId = setTimeout(() => this.gameLoop(), this.speed);
    }
    
    update() {
        // Update direction
        this.direction = { ...this.nextDirection };
        
        // Calculate new head position
        const head = this.snake[0];
        const newHead = {
            x: (head.x + this.direction.x + this.tileCount) % this.tileCount,
            y: (head.y + this.direction.y + this.tileCount) % this.tileCount
        };
        
        // Check collision with self
        if (this.snake.some(segment => segment.x === newHead.x && segment.y === newHead.y)) {
            this.endGame();
            return;
        }
        
        // Add new head
        this.snake.unshift(newHead);
        
        // Check if food eaten
        if (newHead.x === this.food.x && newHead.y === this.food.y) {
            this.score += 10 * this.level;
            this.addLog(`Food eaten! Score: ${this.score}`);
            this.food = this.generateFood();
            
            // Increase level every 50 points
            const newLevel = Math.floor(this.score / 50) + 1;
            if (newLevel !== this.level) {
                this.level = newLevel;
                this.speed = Math.max(30, this.baseSpeed - (this.level - 1) * 10);
                this.addLog(`Level up! Level: ${this.level}, Speed: ${this.speed}ms`);
            }
        } else {
            // Remove tail if no food eaten
            this.snake.pop();
        }
        
        this.updateUI();
    }
    
    endGame() {
        this.gameRunning = false;
        this.gameOver = true;
        clearTimeout(this.gameLoopId);
        this.addLog(`Game Over! Final Score: ${this.score}, Level: ${this.level}`);
        this.updateUI();
    }
    
    draw() {
        // Clear canvas
        this.ctx.fillStyle = '#1a1a1a';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Draw grid (optional)
        this.ctx.strokeStyle = '#333';
        this.ctx.lineWidth = 0.5;
        for (let i = 0; i <= this.tileCount; i++) {
            const pos = i * this.gridSize;
            this.ctx.beginPath();
            this.ctx.moveTo(pos, 0);
            this.ctx.lineTo(pos, this.canvas.height);
            this.ctx.stroke();
            
            this.ctx.beginPath();
            this.ctx.moveTo(0, pos);
            this.ctx.lineTo(this.canvas.width, pos);
            this.ctx.stroke();
        }
        
        // Draw snake
        this.snake.forEach((segment, index) => {
            if (index === 0) {
                // Head - gradient
                const gradient = this.ctx.createRadialGradient(
                    segment.x * this.gridSize + this.gridSize / 2,
                    segment.y * this.gridSize + this.gridSize / 2,
                    0,
                    segment.x * this.gridSize + this.gridSize / 2,
                    segment.y * this.gridSize + this.gridSize / 2,
                    this.gridSize
                );
                gradient.addColorStop(0, '#00ff00');
                gradient.addColorStop(1, '#00aa00');
                this.ctx.fillStyle = gradient;
            } else {
                // Body - gradient from light to dark
                const opacity = 1 - (index / this.snake.length) * 0.5;
                this.ctx.fillStyle = `rgba(0, 220, 100, ${opacity})`;
            }
            
            this.ctx.fillRect(
                segment.x * this.gridSize + 1,
                segment.y * this.gridSize + 1,
                this.gridSize - 2,
                this.gridSize - 2
            );
            
            // Draw eyes on head
            if (index === 0) {
                this.ctx.fillStyle = '#000';
                const eyeSize = 2;
                const eyeOffsetX = this.direction.x !== 0 ? 6 : 3;
                const eyeOffsetY = this.direction.y !== 0 ? 6 : 3;
                
                this.ctx.beginPath();
                this.ctx.arc(
                    segment.x * this.gridSize + eyeOffsetX,
                    segment.y * this.gridSize + eyeOffsetY,
                    eyeSize,
                    0,
                    Math.PI * 2
                );
                this.ctx.fill();
                
                this.ctx.beginPath();
                this.ctx.arc(
                    segment.x * this.gridSize + this.gridSize - eyeOffsetX,
                    segment.y * this.gridSize + eyeOffsetY,
                    eyeSize,
                    0,
                    Math.PI * 2
                );
                this.ctx.fill();
            }
        });
        
        // Draw food
        const foodX = this.food.x * this.gridSize + this.gridSize / 2;
        const foodY = this.food.y * this.gridSize + this.gridSize / 2;
        const foodRadius = this.gridSize / 2 - 2;
        
        // Food glow effect
        this.ctx.fillStyle = 'rgba(255, 100, 0, 0.3)';
        this.ctx.beginPath();
        this.ctx.arc(foodX, foodY, foodRadius + 4, 0, Math.PI * 2);
        this.ctx.fill();
        
        // Food
        const gradient = this.ctx.createRadialGradient(foodX, foodY, 0, foodX, foodY, foodRadius);
        gradient.addColorStop(0, '#ffff00');
        gradient.addColorStop(1, '#ff8800');
        this.ctx.fillStyle = gradient;
        this.ctx.beginPath();
        this.ctx.arc(foodX, foodY, foodRadius, 0, Math.PI * 2);
        this.ctx.fill();
    }
    
    updateUI() {
        document.getElementById('score').textContent = this.score;
        document.getElementById('level').textContent = this.level;
        document.getElementById('speed').textContent = this.speed + 'ms';
        
        // Update button states
        document.getElementById('startBtn').disabled = this.gameRunning;
        document.getElementById('pauseBtn').disabled = !this.gameRunning;
        document.getElementById('pauseBtn').textContent = this.gamePaused ? '▶ Resume' : '⏸ Pause';
    }
    
    addLog(message) {
        const timestamp = new Date().toLocaleTimeString();
        this.logs.push(`[${timestamp}] ${message}`);
        
        if (this.logs.length > this.maxLogs) {
            this.logs.shift();
        }
        
        window.dispatchEvent(new CustomEvent('snakeLog', { detail: { logs: this.logs } }));
    }
    
    getGameState() {
        return {
            snake: this.snake,
            food: this.food,
            direction: this.direction,
            nextDirection: this.nextDirection,
            score: this.score,
            level: this.level,
            speed: this.speed,
            gameRunning: this.gameRunning,
            gamePaused: this.gamePaused,
            gameOver: this.gameOver,
            logs: this.logs
        };
    }
}

// Initialize game
let game;

window.addEventListener('DOMContentLoaded', () => {
    game = new SnakeGame('gameCanvas');
    
    document.getElementById('startBtn').addEventListener('click', () => game.start());
    document.getElementById('pauseBtn').addEventListener('click', () => game.pause());
    document.getElementById('resetBtn').addEventListener('click', () => game.reset());
    
    // Initial draw
    game.draw();
});
