/* @module PpmLib */
const fs = require('fs');

const OBSTACLETHRESHOLD = 230; //The threshold value of judging if a pixel is an obstacle.
const RADIUS = 6; // The radius constant of Robot. 6
const ERO = 2; // The coefficient constant of erosion. 2

/**
 * This class is designed to processing the ppm file generated by Intel RealSense Slam Library
 */
class PpmLib {

  /**
   * @constructor
   */
  constructor() {
    this.data = new Array();
    this.pbm = new Array();
    this.WIDTH = 0;
    this.HEIGHT = 0;
    this.format = ''; //todo
    this.remark = ''; //todo
    this.maxValue = 0;
  }

  /**
   * Read the ppm file and store the head info into this.WIDTH, this.HEIGHT, this.format, this.remark, this.maxValue.
   * And store the map data into the this.data.  
   * @param  {String} filename - the full path and name of a ppm file
   */
  loadMap(filename) {
    var p = 0;
    var fd = fs.openSync(filename, 'r');
    var headBuffer = new Buffer(100);
    fs.readSync(fd, headBuffer, 0, 100, 0);

    if(headBuffer.readUInt8(0) != 80 || headBuffer.readUInt8(1) != 54 || headBuffer.readUInt8(2) != 10)  {
		  console.log('Not P6 ppm format');
		  return;
    }

		let wString = '';
		for(p = 3; headBuffer.readUInt8(p) != 32; p++) {
		  wString +=(headBuffer.readUInt8(p) - 48).toString();
		}
		this.WIDTH = Number(wString);

		let hString = '';
		for(p++ ; headBuffer.readUInt8(p) != 10; p++) {
		  hString +=(headBuffer.readUInt8(p) - 48).toString();
		}
		this.HEIGHT = Number(hString);

		let maxValueString = '';
		for(p++ ; p < 40; p++) {
		  if(headBuffer.readUInt8(p) == 10) break; 
		  maxValueString +=(headBuffer.readUInt8(p) - 48).toString();
		}	
		this.maxValue = Number(maxValueString);

		if(this.maxValue != 255) {
		  console.log('error ppm format');	
		  return;
		}

    var buffer = new Buffer(headBuffer.length + this.WIDTH*this.HEIGHT*3);
    fs.readSync(fd, buffer, 0, headBuffer.length + this.WIDTH*this.HEIGHT*3, 0);
		//let ppmLength = p + this.WIDTH * this.HEIGHT * 3;
		p++;
		for(let i = 0; i < this.HEIGHT; i++) {
		  this.data.push([]);
		  for(let j = 0; j < this.WIDTH; j++) {
			  this.data[i].push([buffer.readUInt8(p+(i*this.WIDTH+j)*3), buffer.readUInt8(p+(i*this.WIDTH+j)*3+1) ,buffer.readUInt8(p+(i*this.WIDTH+j)*3+2)]);
		  }
		}
		fs.closeSync(fd);
  }

  /**
   * Transfer RGB value in this.data to binary value. 0 represents it is an obstacle or unknowed. 1 represents it has no obstacle.
   */
  toPbm() {
  	if(this.data.length < 1) {
  	  console.log('Please load a ppm map first');
  	  return;
  	}

		for(let i = 0; i < this.HEIGHT; i++) {
		  this.pbm.push([]);
		  for(let j = 0; j < this.WIDTH; j++) {
		  	if(this.data[i][j][0] == 200) {
		  	  this.pbm[i].push(0);
		  	}
		  	else if(this.data[i][j][0] == 64) {
		  	  this.pbm[i].push(1);
		  	}
		  	else if(this.data[i][j][1] > OBSTACLETHRESHOLD) {
		  	  this.pbm[i].push(1);
		  	}
		  	else {
		  	  this.pbm[i].push(0);
		  	}
		  }
		}
  }

  /**
   *
   * Generate a pgm map from the ppm file. 200 represents it is unknowed. 254 represents it has no obstacle.
   * 0 represents an obstacle.
   * @param  {String} filename - the full path and name of a pgm file you want to save.
   */
  saveAsPgmMap(filename) {
  	if(this.data.length < 1) {
  	  console.log('Please load a ppm map first');
  	  return;
  	}  	
    var fd = fs.openSync(filename, 'w');

    let pgmHead = 'P5\n' + this.WIDTH.toString() + ' ' + this.HEIGHT.toString() + '\n255\n';
    let headBuffer = new Buffer(pgmHead, 'utf8');
    fs.writeSync(fd, headBuffer, 0, headBuffer.length, 0);

    var pgmMap = [];
    for(let i = 0; i < this.HEIGHT; i++) {
		  for(let j = 0; j < this.WIDTH; j++) {
		  	if(this.data[i][j][0] == 200) {
		  	  pgmMap.push(200);
		  	}
		  	else if(this.data[i][j][0] == 64) {
		  	  pgmMap.push(254);
		  	}
		  	else if(this.data[i][j][1] > OBSTACLETHRESHOLD) {
		  	  pgmMap.push(254);
		  	}
		  	else {
		  	  pgmMap.push(0);
		  	}
		  }
		}

    let dataBuffer = new Buffer(pgmMap);
    fs.writeSync(fd, dataBuffer, 0, dataBuffer.length, headBuffer.length);
		fs.closeSync(fd);
  }

  /**
   * AStar algorithm
   * @param  {Array} start - The coordinate of start. 
   * @param  {Array} goal - The coordinate of goal.
   * @param  {String} pathFilename - The filename of the ppm file in which you saved the visited pixels and path.
   * @return {Array} return the the visited pixels and path.
   */
  AStar(start, goal, pathFilename) {
  	function distance(p, q) {
  		return Math.sqrt((p[0]-q[0])*(p[0]-q[0]) + (p[1]-q[1])*(p[1]-q[1]));
  	}
  	if(this.pbm.length < 1) this.toPbm();

  	this.pbm = this.erode(this.pbm, ERO); // erode
  	this.pbm = this.dilate(this.pbm, RADIUS) // dilate

		var s2 = Math.sqrt(2);
		var movement = [[1,0, 1.], [0,1, 1.], [-1,0, 1.], [0,-1, 1.],
              	    [1,1, s2], [-1,1, s2], [-1,-1, s2], [1,-1, s2], 
              	   ];

		var front = new Heapq();
  	front.heappush([distance(start, goal) + 0.001, 0.001, start, null]);
  	var extents = [this.WIDTH, this.HEIGHT];
  	var visited = new TdArray(extents);

  	var cameFrom = {};

  	while(front.length() != 0) {

  		let cur = front.heappop();
  		let totalCost = cur[0];
  		let cost = cur[1];
  		var pos = cur[2];
  		let pre = cur[3];

  		if(visited.get(pos) > 0) continue;

  		visited.put(1, pos);
  		cameFrom[pos] = pre;

  		if(pos[0] == goal[0] && pos[1] == goal[1]) break;

  		for(let i in movement) {
  			let newX = pos[0] + movement[i][0];
  			let newY = pos[1] + movement[i][1];
  			if(newX < 0 || newX >= extents[0] || newY < 0 || newY >= extents[1]) continue;
  			let newPos = [newX, newY];
  			if(visited.get(newPos) == 0 && this.pbm[newPos[1]][newPos[0]] != 0) {
  				let g = cost + movement[i][2];
  				front.heappush([distance(goal, newPos) + g, g, newPos, pos]);  				
  			}
  		}
  	}

  	var path = [];
  	if(pos[0] == goal[0] && pos[1] == goal[1]) {
  		while(pos != null) {
  			//console.log(pos);
  			path.push(pos);
  			pos = cameFrom[pos];
  		}
  		path.reverse();
  	}
  	else {
  		console.log('Path not found');
  		//return [[], visited];
  	}

  	//draw the visited map and path
  	if(pathFilename != undefined) this.drawPath(path, visited, start, goal, pathFilename);
  	return [path, visited];
  }

  /**
   * dijkstra algorithm
   * @param  {Array} start - The coordinate of start. 
   * @param  {Array} goal - The coordinate of goal.
   * @param  {String} pathFilename - The filename of the ppm file in which you saved the visited pixels and path.
   * @return {Array} return the the visited pixels and path.
   */
  dijkstra(start, goal, pathFilename) {
  	if(this.pbm.length < 1) this.toPbm();

  	//this.pbm = this.erode(this.pbm, ERO); // erode
  	this.pbm = this.dilate(this.pbm, RADIUS) // dilate

		var s2 = Math.sqrt(2);
		var movement = [[1,0, 1.], [0,1, 1.], [-1,0, 1.], [0,-1, 1.],
              	    [1,1, s2], [-1,1, s2], [-1,-1, s2], [1,-1, s2], 
              	   ];
		var front = new Heapq();
  	front.heappush([0.001, start, null]);
  	var extents = [this.WIDTH, this.HEIGHT];
  	var visited = new TdArray(extents);

  	var cameFrom = {};

  	while(front.length() != 0) {

  		let cur = front.heappop();
  		let cost = cur[0];
  		var pos = cur[1];
  		let pre = cur[2];

  		if(visited.get(pos) > 0) continue;

  		visited.put(cost, pos);
  		cameFrom[pos] = pre;

  		if(pos[0] == goal[0] && pos[1] == goal[1]) break;

  		for(let i in movement) {
  			let newX = pos[0] + movement[i][0];
  			let newY = pos[1] + movement[i][1];
  			if(newX < 0 || newX >= extents[0] || newY < 0 || newY >= extents[1]) continue;
  			let newPos = [newX, newY];
  			if(visited.get(newPos) == 0 && this.pbm[newPos[1]][newPos[0]] != 0)
  				front.heappush([cost + movement[i][2], newPos, pos]);
  		}
  	}

  	var path = [];
  	if(pos[0] == goal[0] && pos[1] == goal[1]) {
  		while(pos != null) {
  			//console.log(pos);
  			path.push(pos);
  			pos = cameFrom[pos];
  		}
  		path.reverse();
  	}
  	else {
  		console.log('Path not found');
  		//return [[], visited];
  	}

  	//draw the visited map and path
  	if(pathFilename != undefined) this.drawPath(path, visited, start, goal, pathFilename);
  	return [path, visited];
	}

	/**
   * @param  {Array} path
   * @param  {Array} visited
   * @param  {Array} start - The coordinate of start. 
   * @param  {Array} goal - The coordinate of goal.
	 * @param  {String} pathFilename
	 * @return {Array} return the the visited pixels and path.
	 */
	drawPath(path, visited, start, goal, pathFilename) {
  	var fd = fs.openSync(pathFilename, 'w');

    let pgmHead = 'P6\n' + this.WIDTH.toString() + ' ' + this.HEIGHT.toString() + '\n255\n';
    let headBuffer = new Buffer(pgmHead, 'utf8');
    fs.writeSync(fd, headBuffer, 0, headBuffer.length, 0);

    var pgmMap = [];
    for(let i = 0; i < this.HEIGHT; i++) {
		  for(let j = 0; j < this.WIDTH; j++) {
		  	if(j == start[0] && i == start[1] || j == goal[0] && i == goal[1]) {
		  	  pgmMap.push(0);
		  	  pgmMap.push(0);
		  	  pgmMap.push(0);
		  	}
		  	else if(this.pbm[i][j] == 0) {
			  	pgmMap.push(255);
			  	pgmMap.push(0);
			  	pgmMap.push(0);	 
		  	}
		  	else if(visited.get([j,i]) > 0) {
		  		//let c = visited.get([j,i])*(255/(this.WIDTH+this.HEIGHT));
		  	  pgmMap.push(0);
		  	  pgmMap.push(255);
		  	  pgmMap.push(0);
		  	}
		  	else {
		  	  pgmMap.push(255);
		  	  pgmMap.push(255);
		  	  pgmMap.push(255);
		  	}
		  }
		}

		for(let i in path) {
			pgmMap[(path[i][0] + path[i][1] * this.WIDTH) * 3] = 0;
			pgmMap[(path[i][0] + path[i][1] * this.WIDTH) * 3 + 1] = 0;
			pgmMap[(path[i][0] + path[i][1] * this.WIDTH) * 3 + 2 ] = 0;
		}

    let dataBuffer = new Buffer(pgmMap);
    fs.writeSync(fd, dataBuffer, 0, dataBuffer.length, headBuffer.length);
		fs.closeSync(fd);

  	return [path, visited];
  }

  /**
   * informal erosion algorithm
   * @param  {Array} pbm - The binary map.
   * @param {Number} r - The coefficient constant of erosion. 
   * @return {Array} The eroded binary map.
   */
  erode(pbm, r) {
  	let h = pbm.length;
  	let w = pbm[0].length;
		let neighbor = [[1,0], [0,1], [-1,0], [0,-1],
		          	    [1,1], [-1,1], [-1,-1], [1,-1], 
		          	   ];

		var eroded = [];
  	for(let i = 0; i < h; i++) {
  		eroded.push([]);
  		for(let j = 0; j < w; j++) {
  			eroded[i].push(pbm[i][j]);
  		}
  	}
    for(let i = 1; i < h-1; i++) {
    	for(let j = 1; j < w-1; j++) {
    		if(pbm[i][j] == 1) continue;
    		let flag = 0;
    		for(let k in neighbor) {
    			if(pbm[i+neighbor[k][1]][j+neighbor[k][0]] == 0) {
    				flag++;
    			}
    		}
    		if(flag <= r) eroded[i][j] = 1;
    	}
    }

    return eroded;
  }
 
  /**
   * informal dilatation algorithm
   * @param  {Array} pbm - The binary map.
   * @param  {Number} r - The radius constant of Robot. 
   * @return {Array} The dilated binary map.
   */
  dilate(pbm, r) {
  	let rr = r * r;
  	let neighbor = [];
  	/*
		let neighbor = [[1,0], [0,1], [-1,0], [0,-1],
		          	    [1,1], [-1,1], [-1,-1], [1,-1], 
		          	   ];
  	*/
  	let x, y;
  	for(x = -r; x <= r; x++) {
  		for(y = -r; y <= r; y++) {
  			if(x*x + y*y <= rr) neighbor.push([x, y]);
  		}
  	}

  	let h = pbm.length;
  	let w = pbm[0].length;
  	var dilated = [];
  	for(let i = 0; i < h; i++) {
  		dilated.push([]);
  		for(let j = 0; j < w; j++) {
  			dilated[i].push(pbm[i][j]);
  		}
  	}

    for(let i = r; i < h-r; i++) {
    	for(let j = r; j < w-r; j++) {
    		if(pbm[i][j] == 0) continue;
    		let flag = false;
    		for(let k in neighbor) {
    			if(pbm[i+neighbor[k][1]][j+neighbor[k][0]] == 0) {
    				flag = true;
    				break;
    			}
    		}
    		if(flag == true) dilated[i][j] = 0;
    	}
    }  	

    return dilated;
  }

} //class PpmLib end

class TdArray {

	constructor(extents) {
		this.extents = extents;
		this.i = 0;
		this.data = new Array();
		if(extents != undefined)
			for(let i = 0; i < extents[1]; i++) {
				this.data.push([])
				for(let j = 0; j < extents[0]; j++)
					this.data[i].push(0.0);
			}

	}

	put(value, pos) {
		this.data[pos[1]][pos[0]] = value;
	}

	remove(pos) {
		//
	}

	get(pos) {
		return this.data[pos[1]][pos[0]];
	}

	length() {
		var count = 0;
		for(let i = 0; i < this.extents[1]; i++) 
			for(let j = 0; j < this.extents[0]; j++)
				if(this.data[i][j] > 0.0) count++;
		return count;
  }
} //class TdArray end

class Heapq {
	constructor() {
		this.array = [];
	}

  swap(array, i, j) {
    var temp = array[i];
    array[i] = array[j];
    array[j] = temp;
  }

  heapify(array, index, heapSize) {
    var iMin, iLeft, iRight;
    var flag = Boolean(index);
    while (index > -1) {
      iMin = index;
      iLeft = 2 * index + 1;
      iRight = 2 * (index + 1);
      if (iLeft < heapSize && array[index][0] > array[iLeft][0]) {
        iMin = iLeft;
      }
      if (iRight < heapSize && array[iMin][0] > array[iRight][0]) {
        iMin = iRight;
      }
      if (iMin != index) {
        this.swap(array, iMin, index);
        if(flag) index = Math.floor((index-1)/2);
        else index = iMin;
      } else {
        break;
      }
    }
  }

  buildHeap(array) {
    var i,
      iParent = Math.floor(array.length / 2) - 1;
    for(i = iParent; i >= 0; i--) {
      this.heapify(array, i, array.length);
    }
  }

  heappush(element) {
  	this.array.push(element);
    //this.buildHeap(this.array);
  	this.heapify(this.array, Math.floor(this.array.length / 2) - 1, this.array.length);
  }

  heappop() {
    this.swap(this.array, 0, this.array.length-1);
    this.heapify(this.array, 0, this.array.length-1);
    return this.array.pop();
  }

  length() {
  	return this.array.length;
  }

} // class Heapq end


exports.PpmLib = PpmLib;