/*
 * 
 *                  xxxxxxx      xxxxxxx
 *                   x:::::x    x:::::x 
 *                    x:::::x  x:::::x  
 *                     x:::::xx:::::x   
 *                      x::::::::::x    
 *                       x::::::::x     
 *                       x::::::::x     
 *                      x::::::::::x    
 *                     x:::::xx:::::x   
 *                    x:::::x  x:::::x  
 *                   x:::::x    x:::::x 
 *              THE xxxxxxx      xxxxxxx TOOLKIT
 *                    
 *                  http://www.goXTK.com
 *                   
 * Copyright (c) 2012 The X Toolkit Developers <dev@goXTK.com>
 *                   
 *    The X Toolkit (XTK) is licensed under the MIT License:
 *      http://www.opensource.org/licenses/mit-license.php
 * 
 *      'Free software' is a matter of liberty, not price.
 *      'Free' as in 'free speech', not as in 'free beer'.
 *                                         - Richard M. Stallman
 * 
 * CREDITS
 * 
 *   - the .NRRD Fileparser is based on a version of Michael Lauer (https://github.com/mrlauer/webgl-sandbox)
 *     which did not support gzip/gz encoding or other types than int/short, so we added that :)
 *   
 */

// provides
goog.provide('X.parserNRRD');

// requires
goog.require('X.event');
goog.require('X.object');
goog.require('X.parser');
goog.require('X.triplets');
goog.require('goog.math.Vec3');
goog.require('Zlib.Gunzip');


/**
 * Create a parser for .NRRD files.
 * 
 * @constructor
 * @extends X.parser
 */
X.parserNRRD = function() {

  //
  // call the standard constructor of X.parser
  goog.base(this);
  
  //
  // class attributes
  
  /**
   * @inheritDoc
   * @const
   */
  this._classname = 'parserNRRD';
  
};
// inherit from X.parser
goog.inherits(X.parserNRRD, X.parser);


/**
 * @inheritDoc
 */
X.parserNRRD.prototype.parse = function(container, object, data, flag) {

  X.TIMER(this._classname + '.parse');
  
  // attach the data so we can use the internal scan function
  this._data = data;
  
  var _bytes = this.scan('uchar', data.byteLength);
  var _length = _bytes.length;
  
  var _header = null;
  var _data_start = 0;
  
  var i;
  for (i = 1; i < _length; i++) {
    
    if (_bytes[i - 1] == 10 && _bytes[i] == 10) {
      
      // we found two line breaks in a row
      
      // now we know what the header is
      _header = this.parseChars(_bytes, 0, i - 2);
      
      // this is were the data starts
      _data_start = i + 1;
      break;
      
    }
    
  }
  
  // parse the header
  this.parseHeader(_header);
  
  // now we have all kinds of things attached to this reader..
  // this was done by M. Lauer
  // I don't really like it but it works..
  
  var _data = _bytes.subarray(_data_start); // the data without header
  
  if (this.encoding == 'gzip' || this.encoding == 'gz') {
    
    // we need to decompress the datastream
    
    // here we start the unzipping and get a typed Uint8Array back
    var inflate = new Zlib.Gunzip(new Uint8Array(_data));
    _data = inflate.decompress();
    
  }
  
  // .. let's use the underlying array buffer
  _data = _data.buffer;
  
  var MRI = {
    data: null,
    min: Infinity,
    max: -Infinity,
    image_position : null,
    space : null,
    space_orientation : null,
    anatomical_orientation : 5
  };
  
  //
  // parse the (unzipped) data to a datastream of the correct type
  //
  MRI.data = new this.__array(_data);
  
  // get the min and max intensities
  var min_max = this.arrayMinMax(MRI.data);
  var min = MRI.min = min_max[0];
  var max = MRI.max = min_max[1];
  
  //
  // we know enough to create the object
  
  // origin
  // var _origin = this['space origin'];
  // _origin = _origin.slice(1, _origin.length).split(',');
  // object._center[0] = parseFloat(_origin[0]) - this.sizes[0] / 2;
  // object._center[1] = parseFloat(_origin[1]) - this.sizes[1] / 2;
  // object._center[2] = parseFloat(_origin[2]) - this.sizes[2] / 2;
  
  // dimensions
  object._dimensions = [this.sizes[0], this.sizes[1], this.sizes[2]];
  
  // spacing
  var spacingX = new goog.math.Vec3(this.vectors[0][0], this.vectors[0][1],
      this.vectors[0][2]).magnitude();
  var spacingY = new goog.math.Vec3(this.vectors[1][0], this.vectors[1][1],
      this.vectors[1][2]).magnitude();
  var spacingZ = new goog.math.Vec3(this.vectors[2][0], this.vectors[2][1],
      this.vectors[2][2]).magnitude();
  object._spacing = [spacingX, spacingY, spacingZ];
  

  // attach the scalar range to the volume
  object._min = object._windowLow = min;
  object._max = object._windowHigh = max;
  // .. and set the default threshold
  // only if the threshold was not already set
  if (object._lowerThreshold == -Infinity) {
    object._lowerThreshold = min;
  }
  if (object._upperThreshold == Infinity) {
    object._upperThreshold = max;
  }
  
  console.log(this.vectors);
  
  var tmp_orient = [];
  tmp_orient.push(this.vectors[0][0]);
  tmp_orient.push(this.vectors[0][1]);
  tmp_orient.push(this.vectors[0][2]);
  tmp_orient.push(this.vectors[1][0]);
  tmp_orient.push(this.vectors[1][1]);
  tmp_orient.push(this.vectors[1][2]);
  tmp_orient.push(this.vectors[2][0]);
  tmp_orient.push(this.vectors[2][1]);
  tmp_orient.push(this.vectors[2][2]);
  
  MRI.space = this.space;
  MRI.space_orientation = tmp_orient;
  
  var _x_cosine = this.vectors[0];
  var _x_abs_cosine = _x_cosine.map(function(v) {
    return Math.abs(v);
  });
  var _x_max = _x_abs_cosine.indexOf(Math.max.apply(Math, _x_abs_cosine));
  
  // y cosine = row
  var _y_cosine = this.vectors[1];
  var _y_abs_cosine = _y_cosine.map(function(v) {
    return Math.abs(v);
  });
  var _y_max = _y_abs_cosine.indexOf(Math.max.apply(Math, _y_abs_cosine));
  
  var _scan_direction_int = _x_max + _y_max;
  var _scan_direction = "";
  
  switch (_scan_direction_int) {
  case 1:
    _scan_direction = "AXIAL";
    _scan_direction_int = 2;
    break;
  case 2:
    _scan_direction = "CORONAL";
    _scan_direction_int = 1;
    break;
  case 3:
    _scan_direction = "SAGITTAL";
    _scan_direction_int = 0;
    break;
  default:
    _scan_direction = "unrecognized - assume SAGITTAL";
    _scan_direction_int = 0;
    break;
  }
  // get scan direction
  console.log('x cosine');
  console.log(_x_cosine);
  console.log(_x_max);
  console.log('y cosine');
  console.log(_y_cosine);
  console.log(_y_max);
  console.log('scan direction');
  console.log(_scan_direction);
  
  var orient = [_x_cosine[_x_max]<0?-1:1, _y_cosine[_y_max]<0?-1:1];
  
  // create the object
  object.create_(_scan_direction_int, orient);
  
  X.TIMERSTOP(this._classname + '.parse');

  // now we have the values and need to reslice in the 3 orthogonal directions
  // and create the textures for each slice
  object._image = this.reslice(object, MRI);
  
  // the object should be set up here, so let's fire a modified event
  var modifiedEvent = new X.event.ModifiedEvent();
  modifiedEvent._object = object;
  modifiedEvent._container = container;
  this.dispatchEvent(modifiedEvent);
  
};


/**
 * Parse a NRRD file header.
 * 
 * @param {?string} header The NRRD header to parse.
 * @throws {Error} An error, if the NRRD header is not supported or invalid.
 */
X.parserNRRD.prototype.parseHeader = function(header) {

  var data, field, fn, i, l, lines, m, _i, _len, _results;
  lines = header.split(/\r?\n/);
  for (_i = 0, _len = lines.length; _i < _len; _i++) {
    l = lines[_i];
    if (l.match(/NRRD\d+/)) {
      this.isNrrd = true;
    } else if (l.match(/^#/)) {
    } else if (m = l.match(/(.*):(.*)/)) {
      field = m[1].trim();
      data = m[2].trim();
      fn = this.fieldFunctions[field];
      if (fn) {
        fn.call(this, data);
      } else {
        this[field] = data;
      }
    }
  }
  if (!this.isNrrd) {
    throw new Error('Not an NRRD file');
  }
  if (this.encoding !== 'raw' && this.encoding !== 'gzip' &&
      this.encoding !== 'gz') {
    throw new Error('Only raw or gz/gzip encoding is allowed');
  }
  if (!this.vectors) {
    this.vectors = [new goog.math.Vec3(1, 0, 0), new goog.math.Vec3(0, 1, 0),
                    new goog.math.Vec3(0, 0, 1)];
    if (this.spacings) {
      _results = [];
      for (i = 0; i <= 2; i++) {
        _results.push(!isNaN(this.spacings[i]) ? this.vectors[i]
            .scale(this.spacings[i]) : void 0);
      }
      return _results;
    }
  }
};


/**
 * Functions for parsing the NRRD header fields.
 * 
 * @type {Object}
 */
X.parserNRRD.prototype.fieldFunctions = {
  'type': function(data) {

    switch (data) {
    case 'uchar':
    case 'unsigned char':
    case 'uint8':
    case 'uint8_t':
      this.__array = Uint8Array;
      break;
    case 'signed char':
    case 'int8':
    case 'int8_t':
      this.__array = Int8Array;
      break;
    case 'short':
    case 'short int':
    case 'signed short':
    case 'signed short int':
    case 'int16':
    case 'int16_t':
      this.__array = Int16Array;
      break;
    case 'ushort':
    case 'unsigned short':
    case 'unsigned short int':
    case 'uint16':
    case 'uint16_t':
      this.__array = Uint16Array;
      break;
    case 'int':
    case 'signed int':
    case 'int32':
    case 'int32_t':
      this.__array = Int32Array;
      break;
    case 'uint':
    case 'unsigned int':
    case 'uint32':
    case 'uint32_t':
      this.__array = Uint32Array;
      break;
    case 'float':
      this.__array = Float32Array;
      break;
    default:
      throw new Error('Unsupported NRRD data type: ' + data);
    }
    return this.type = data;
  },
  'endian': function(data) {

    return this.endian = data;
  },
  'encoding': function(data) {

    return this.encoding = data;
  },
  'dimension': function(data) {

    return this.dim = parseInt(data, 10);
  },
  'sizes': function(data) {

    var i;
    return this.sizes = (function() {

      var _i, _len, _ref, _results;
      _ref = data.split(/\s+/);
      _results = [];
      for (_i = 0, _len = _ref.length; _i < _len; _i++) {
        i = _ref[_i];
        _results.push(parseInt(i, 10));
      }
      return _results;
    })();
  },
  'space': function(data) {
    return this.space = data.split("-");
  },
  'space directions': function(data) {

    var f, parts, v;
    parts = data.match(/\(.*?\)/g);
    return this.vectors = (function() {

      var _i, _len, _results;
      _results = [];
      for (_i = 0, _len = parts.length; _i < _len; _i++) {
        v = parts[_i];
        _results.push((function() {

          var _j, _len2, _ref, _results2;
          _ref = v.slice(1, -1).split(/,/);
          _results2 = [];
          for (_j = 0, _len2 = _ref.length; _j < _len2; _j++) {
            f = _ref[_j];
            _results2.push(parseFloat(f));
          }
          return _results2;
        })());
      }
      return _results;
    })();
  },
  'spacings': function(data) {

    var f, parts;
    parts = data.split(/\s+/);
    return this.spacings = (function() {

      var _i, _len, _results;
      _results = [];
      for (_i = 0, _len = parts.length; _i < _len; _i++) {
        f = parts[_i];
        _results.push(parseFloat(f));
      }
      return _results;
    })();
  }
};



// export symbols (required for advanced compilation)
goog.exportSymbol('X.parserNRRD', X.parserNRRD);
goog.exportSymbol('X.parserNRRD.prototype.parse', X.parserNRRD.prototype.parse);
