"use strict";
class PullCube {

    // support for up to PullCube.RT_TEX_SIZE * PullCube.RT_TEX_SIZE number of voxels
    // 512x512 = 64x64x64 = 262,114 voxels
    static get RT_TEX_SIZE()
    {
        return 64;
    }

    static get CUBE_SIZE()
    {
        return 16;
    }

    static get SCULPT_LAYERS()
    {
        return 4;
    }

    constructor()
    {
        
        this._cubeBatch = null; // batch of cubed voxels
 
        this._voxelMaterials = [];    // materials to render the voxels with
        this._voxelMaterialIndex = 0; // index of material currently used

        this._screenQuadMesh; // mesh to apply full-screen effects and blitting

        this._rtCopyBuffer = null;   // framebuffer for copying framebuffer contents
        this._rtPosBuffer = null;
        this._rtVelBuffer = null;

        this._desiredPosBuffer = null;

        this._screenBuffer = null;

        this._copyMaterial;      // material to copy texture
        this._posMaterial;
        this._velMaterial;

        this._composeMaterial = null;   // applies any post processing effects

        this._pMatrix = [];
        this._vMatrix = [];
        this._mMatrix = [];

        this._cameraRotation =  [];
        this._cameraPosition = [];

        this._modelRotation = [];
        this._modelPosition = [];

        this._cameraForward = [];
        this._cameraUp = [];
        this._cameraRight = [];


    }

    //
    // initBuffers
    //
    // creates batched buffers to hold
    // maximum number of cubes
    //
    initBuffers() 
    {
        //maxium particles that can be represented in the textures
        var maxparticleCount = PullCube.RT_TEX_SIZE * PullCube.RT_TEX_SIZE;

        this._cubeBatch = new BatchedCubes(maxparticleCount, PullCube.CUBE_SIZE);
    }


    getFloat32Format()
    {
        var texelData = gl.FLOAT;
        var internalFormat = gl.RGBA;
    
        // need either floating point, or half floating point precision for holding position and velocity data
        if( _supportsWebGL2 )
        {
            var ext = gl.getExtension("EXT_color_buffer_float");
            if( ext == null )
            {
                alert("Device & browser needs to support floating point or half floating point textures in order to work properly");
            }
            else
            {
                internalFormat = gl.RGBA32F;
            }
        }
        else
        {
            var ext = gl.getExtension("OES_texture_float");
            if( ext == null )
            {
                ext = gl.getExtension("OES_texture_half_float");
                if( ext != null )
                {
                    texelData = ext.HALF_FLOAT_OES;
                }
                else
                {
                    alert("Device & browser needs to support floating point or half floating point textures in order to work properly");
                }
            }
        }

        return {"texelData" : texelData, "internalFormat": internalFormat};
    }

    //
    // initParticleData
    //
    // initializes framebuffers, render textures, and materials
    //
    initParticleData() 
    {
        var formats = this.getFloat32Format();

        var texelData = formats["texelData"];
        var internalFormat = formats["internalFormat"];
    
        // need either floating point, or half floating point precision for holding position and velocity data
        if( _supportsWebGL2 )
        {
            var ext = gl.getExtension("EXT_color_buffer_float");
            if( ext == null )
            {
                alert("Device & browser needs to support floating point or half floating point textures in order to work properly");
            }
            else
            {
                internalFormat = gl.RGBA32F;
            }
        }
        else
        {
            var ext = gl.getExtension("OES_texture_float");
            if( ext == null )
            {
                ext = gl.getExtension("OES_texture_half_float");
                if( ext != null )
                {
                    texelData = ext.HALF_FLOAT_OES;
                }
                else
                {
                    alert("Device & browser needs to support floating point or half floating point textures in order to work properly");
                }
            }
        }
    
        // setup framebuffer to render voxel colors & visibility into texture : rgb = xyz, a = visibility
        this._rtPosBuffer = new Framebuffer(
            new Texture(PullCube.RT_TEX_SIZE, PullCube.RT_TEX_SIZE, internalFormat, gl.RGBA, texelData ), null,
            PullCube.RT_TEX_SIZE, PullCube.RT_TEX_SIZE
        );

        this._rtVelBuffer = new Framebuffer(
            new Texture(PullCube.RT_TEX_SIZE, PullCube.RT_TEX_SIZE, internalFormat, gl.RGBA, texelData ), null,
            PullCube.RT_TEX_SIZE, PullCube.RT_TEX_SIZE
        );

        this._desiredPosBuffer = new Framebuffer(
            new Texture(PullCube.RT_TEX_SIZE, PullCube.RT_TEX_SIZE, internalFormat, gl.RGBA, texelData ), null,
            PullCube.RT_TEX_SIZE, PullCube.RT_TEX_SIZE
        );

        // setup framebuffer as intermediate - to copy content
        this._rtCopyBuffer = new Framebuffer(
            new Texture(PullCube.RT_TEX_SIZE, PullCube.RT_TEX_SIZE, internalFormat, gl.RGBA, texelData ), null,
            PullCube.RT_TEX_SIZE, PullCube.RT_TEX_SIZE
        );

        this.setupScreenBuffer();

        this._screenQuadMesh = new Mesh(quadVertices, quadVertexIndices);
    
        gl.bindTexture(gl.TEXTURE_2D, null);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        
        
        // setup data materials
        var quadVS = Material.getShader(gl, "screenquad-vs");
        var copyFS = Material.getShader(gl, "copy-fs");     
        var posFS = Material.getShader(gl, "position-fs");  
        var velFS = Material.getShader(gl, "velocity-fs" );
        var composeFS = Material.getShader(gl, "compose-fs");
        

        this._velMaterial = new Material(quadVS, velFS);
        this._velMaterial.setTexture("uPosTex", this._rtPosBuffer.color().native());
        this._velMaterial.setTexture("uVelTex", this._rtVelBuffer.color().native());
        this._velMaterial.addVertexAttribute("aVertexPosition");
        this._velMaterial.setFloat("uRadius", 0.1 );
        this._velMaterial.setVec2("uCanvasSize", new Float32Array([canvas.width, canvas.height]));
        this._velMaterial.setFloat("uAspect", canvas.height / canvas.width);   
        this._velMaterial.setFloat("uImageSize", PullCube.RT_TEX_SIZE);
        this._velMaterial.setTexture("uDesiredPosTex", this._desiredPosBuffer.color().native());

        this._posMaterial = new Material(quadVS, posFS);
        this._posMaterial.setTexture("uPosTex", this._rtPosBuffer.color().native());
        this._posMaterial.setTexture("uVelTex", this._rtVelBuffer.color().native());
        this._posMaterial.addVertexAttribute("aVertexPosition");
          
        
        // material to copy 1 texture into another
        this._copyMaterial = new Material(quadVS, copyFS);   
        this._copyMaterial.setTexture("uCopyTex", this._rtCopyBuffer.color().native() );
        this._copyMaterial.addVertexAttribute("aVertexPosition");

        this._composeMaterial = new Material(quadVS, composeFS);
        this._composeMaterial.setTexture("uScrTex", this._screenBuffer.color().native());
        this._composeMaterial.setTexture("uPosTex", this._rtPosBuffer.color().native());
        this._composeMaterial.setTexture("uVelTex", this._rtVelBuffer.color().native());
        this._composeMaterial.addVertexAttribute("aVertexPosition");
        this._composeMaterial.setFloat("uAspect", canvas.height / canvas.width);
        
        // initialize data into vox texture
        var initPosFS = Material.getShader(gl, "initdata-fs");
        var initDataMaterial = new Material( quadVS, initPosFS );
        initDataMaterial.addVertexAttribute("aVertexPosition");
        initDataMaterial.setFloat("uCubeSize", PullCube.CUBE_SIZE);
        initDataMaterial.setFloat("uLayersPerRow", PullCube.SCULPT_LAYERS);
        initDataMaterial.setFloat("uImageSize", PullCube.RT_TEX_SIZE);
        
        gl.viewport(0, 0, PullCube.RT_TEX_SIZE, PullCube.RT_TEX_SIZE);
        gl.clearColor(0.0, 0.0, 0.0, 1.0);
        
        this.renderDataBuffer( this._rtPosBuffer.fbo(), initDataMaterial );

        this.blit(this._rtPosBuffer.color().native(), this._desiredPosBuffer.fbo(), PullCube.RT_TEX_SIZE, PullCube.RT_TEX_SIZE);
        
        gl.bindFramebuffer( gl.FRAMEBUFFER, null ); 
        gl.viewport(0, 0, canvas.width, canvas.height);
    }

    //
    // initMaterials
    //
    // Initializes materials for cubes
    //
    initMaterials() 
    {
        this._voxelMaterials.length = 2;
            
        
        var basicVS = Material.getShader(gl, "basic-vs" );  
        var voxelFS = Material.getShader(gl, "cornercolor-fs" );
        var wireframeFS = Material.getShader(gl, "cubeframe-fs");

        this._voxelMaterials[0] = new Material( basicVS, voxelFS );
        this._voxelMaterials[1] = new Material( basicVS, wireframeFS );
        
        mat4.perspective(this._pMatrix, 45, canvas.width/canvas.height, 1.0, 500.0);
        
        this._cameraRotation = quat.create();
        this._cameraPosition = vec3.fromValues(0, 0, -150 );
        this._cameraUp = vec3.fromValues(0.0, 1.0, 0.0 );

        this._modelRotation = quat.fromValues(-0.876, 0.151, 0.266, 0.373);
        this._modelPosition = vec3.fromValues(0.0, 0.0, 0.0);
        
        
        mat4.fromRotationTranslation( this._vMatrix, this._cameraRotation, this._cameraPosition );
        mat4.fromRotationTranslation( this._mMatrix, this._modelRotation, this._modelPosition );
        

        for( var i=0; i < this._voxelMaterials.length; i++ )
        {
            this._voxelMaterials[i].setTexture("uPosTex", this._rtPosBuffer.color().native() );
            this._voxelMaterials[i].addVertexAttribute("aVertexPosition");
            this._voxelMaterials[i].setMatrix("uPMatrix", new Float32Array( this._pMatrix ) );
            this._voxelMaterials[i].setMatrix("uVMatrix", new Float32Array( this._vMatrix ) );
            this._voxelMaterials[i].setMatrix("uMMatrix", new Float32Array(this._mMatrix));
            this._voxelMaterials[i].setFloat("uCubeSize", PullCube.CUBE_SIZE);
            this._voxelMaterials[i].setFloat("uLayersPerRow", PullCube.SCULPT_LAYERS);
            this._voxelMaterials[i].setFloat("uImageSize", PullCube.RT_TEX_SIZE);
        }

        this._velMaterial.setMatrix("uPMatrix", new Float32Array( this._pMatrix ) );
        this._velMaterial.setMatrix("uVMatrix", new Float32Array( this._vMatrix ) );
        this._velMaterial.setMatrix("uMMatrix", new Float32Array(this._mMatrix));
    }

    
    setupScreenBuffer()
    {
        var texelData = gl.UNSIGNED_BYTE;
        var depthInternal = _supportsWebGL2 ? gl.DEPTH_COMPONENT24 : gl.DEPTH_COMPONENT;

        var colorTex = new Texture( canvas.width, canvas.height, gl.RGBA, gl.RGBA, texelData );
        var depthTex = new Texture(canvas.width, canvas.height, depthInternal, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT);
        
        if( this._screenBuffer )
        {
            this._screenBuffer.setup( colorTex, depthTex, canvas.width, canvas.height );
        }
        else
        {
            this._screenBuffer = new Framebuffer( colorTex, depthTex, canvas.width, canvas.height );
        }

        if( this._composeMaterial )
        {
            this._composeMaterial.setTexture("uScrTex", this._screenBuffer.color().native());
            this._composeMaterial.setFloat("uAspect", canvas.height / canvas.width);
        }

        if( this._velMaterial)
        {
            this._velMaterial.setVec2("uCanvasSize", new Float32Array([canvas.width, canvas.height]));
            this._velMaterial.setFloat("uAspect", canvas.height / canvas.width);   
        }

    }


    blit( texture, renderBuffer, viewWidth, viewHeight )
    {
        gl.viewport(0, 0, viewWidth, viewHeight);

        this._copyMaterial.setTexture("uCopyTex", texture );
        gl.bindFramebuffer( gl.FRAMEBUFFER, renderBuffer );
        gl.clear( gl.COLOR_BUFFER_BIT );
    
        this._copyMaterial.apply();

        this._screenQuadMesh.render();
        
        this._copyMaterial.setTexture("uCopyTex", this._rtCopyBuffer.color().native() );
        
        Framebuffer.bindDefault();
    }

    handleTextureLoaded(image, texture) {
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.bindTexture(gl.TEXTURE_2D, null);
    
        this.blit(texture, this._rtPosBuffer.fbo(), PullCube.RT_TEX_SIZE, PullCube.RT_TEX_SIZE );
    }

    //
    // renderDataBuffer
    //
    // takes a framebuffer and material
    // renders a quad with the dataMaterial into the dataBuffer
    // using a buffer inbetween so it can use it's previous frame texture as data
    //
    renderDataBuffer( dataBuffer, dataMaterial )
    {    
        
        // render data into copy texture
        gl.bindFramebuffer( gl.FRAMEBUFFER, this._rtCopyBuffer.fbo() );
        gl.clear( gl.COLOR_BUFFER_BIT );
        
        dataMaterial.apply();     
        this._screenQuadMesh.render();  
        
        // render copy texture into data texture
        gl.bindFramebuffer( gl.FRAMEBUFFER, dataBuffer );
        gl.clear( gl.COLOR_BUFFER_BIT );
    
        this._copyMaterial.apply(); 
        this._screenQuadMesh.render(); 
    }

    //
    // renderParticleData
    //
    // Renders updates into the voxel data texture
    //
    renderParticleData(deltaTime) 
    {
        gl.viewport(0, 0, PullCube.RT_TEX_SIZE, PullCube.RT_TEX_SIZE);
        gl.clearColor(0.0, 0.0, 0.0, 0.0);
        
        this._posMaterial.setFloat("uDeltaTime", deltaTime );
        this._velMaterial.setFloat("uDeltaTime", deltaTime );

        this.renderDataBuffer( this._rtVelBuffer.fbo(), this._velMaterial );
        this.renderDataBuffer( this._rtPosBuffer.fbo(), this._posMaterial );
        
        Framebuffer.bindDefault();
    }

    init()
    {
        this.initBuffers();  
        this.initParticleData();      
        this.initMaterials();
    }

    update()
    {
        mat4.fromRotationTranslation( this._vMatrix, this._cameraRotation, this._cameraPosition);
        mat4.fromRotationTranslation( this._mMatrix, this._modelRotation, this._modelPosition );
        
        this._voxelMaterials[this._voxelMaterialIndex].setMatrix("uMMatrix", this._mMatrix );  
        this._voxelMaterials[this._voxelMaterialIndex].setMatrix("uVMatrix", this._vMatrix );
    
        this._velMaterial.setMatrix("uMMatrix", this._mMatrix);
        this._velMaterial.setMatrix("uVMatrix", this._vMatrix);

        var invVP = [];
        mat4.multiply(invVP, this._vMatrix, this._mMatrix);
        mat4.multiply(invVP, this._pMatrix, invVP);
        mat4.invert(invVP, invVP);

        this._velMaterial.setMatrix("uInvMVPMatrix", invVP);
    }

    postUpdate()
    {
        //this._toolDataMaterial.setVec3("uLastDir", [sculptRay[0], sculptRay[1], sculptRay[2]]);
        this._velMaterial.setVec3("uLastPos", [mouseCoord[0] * 0.5 + 0.5, mouseCoord[1] * 0.5 + 0.5, mouseCoord[2]]);
    }


    render()
    {   
        this.renderParticleData( Time.deltaTime );

        this._screenBuffer.bind();

        gl.clearColor( 0.5, 0.5, 0.5, 0.0 );
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    
        this._voxelMaterials[this._voxelMaterialIndex].apply();
        this._cubeBatch.render();
    
        Framebuffer.bindDefault();
        gl.clear( gl.COLOR_BUFFER_BIT );
    
        this._composeMaterial.apply();
        this._screenQuadMesh.render();
    }

    handleResize()
    {
        mat4.perspective(this._pMatrix, 45, canvas.width/canvas.height, 1, 500.0);
    
        for( var i=0; i < this._voxelMaterials.length; i++ )
        {
            this._voxelMaterials[i].setMatrix("uPMatrix", this._pMatrix );
        }

        this._velMaterial.setMatrix("uPMatrix", this._pMatrix);
        
        // Set the viewport to match
        gl.viewport(0, 0, canvas.width,canvas.height);

        this.setupScreenBuffer();
    }

    handleZoom(delta)
    {
        var currentZ = this._cameraPosition[2];

        currentZ += delta;

        if( currentZ < -250 )
        {
            currentZ = -250;
        }
        else if ( currentZ > -10 )
        {
            currentZ = -10;
        }

        this._cameraPosition[2] = currentZ;
    }

    handleRotate(dX, dY )
    {
        var verticalRot = quat.create();
        quat.rotateX(verticalRot, verticalRot, dY * 30.0 );
        
        var horizontalRot = quat.create();
        quat.rotateY(horizontalRot, horizontalRot, dX * 30.0 );
        
        quat.multiply( this._modelRotation, horizontalRot, this._modelRotation );
        quat.multiply( this._modelRotation, verticalRot, this._modelRotation );
        
        vec3.transformQuat(this._cameraForward, vec3.fromValues(0.0, 0.0, -1.0 ), this._modelRotation );
        vec3.normalize(this._cameraForward, this._cameraForward );
        vec3.cross( this._cameraRight, this._cameraForward, this._cameraUp );
        vec3.normalize(this._cameraRight, this._cameraRight );
        vec3.cross( this._cameraUp, this._cameraRight, this._cameraForward );
        vec3.normalize(this._cameraUp, this._cameraUp );
    }

    handleToolUse(nX, nY)
    {      
        this._velMaterial.setVec3("uMousePos", [ nX * 0.5 + 0.5, nY * 0.5 + 0.5, -1.0]);           
    }

    handleMouseMove(nX, nY)
    {
        this._velMaterial.setVec3("uMousePos", [ nX * 0.5 + 0.5, nY * 0.5 + 0.5, -1.0]);
    }


    changeBrushSize(brushSize) {
        this._velMaterial.setFloat("uRadius", brushSize);
    }


    setVoxelMaterialIndex(materialIndex) {
        this._voxelMaterialIndex = materialIndex;
    }

    getVoxTextureCPU() {
        this._rtPosBuffer.bind();
        var pixels = new Uint8Array(PullCube.RT_TEX_SIZE*PullCube.RT_TEX_SIZE*4);

        gl.readPixels(0, 0, PullCube.RT_TEX_SIZE, PullCube.RT_TEX_SIZE, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

        Framebuffer.bindDefault();

        return pixels;
    }


}

var quadVertices = [
  -1.0, -1.0,  -1.0,
    1.0, -1.0,  -1.0,
    1.0,  1.0,  -1.0,
  -1.0,  1.0,  -1.0,
];

var quadVertexIndices = [
    0,  1,  2,      
    0,  2,  3
];


var floorVertices = [
    -128.0, -64.0, -128.0,
    -128.0, -64.0, 128.0,
    128.0, -64.0, 128.0,
    128.0, -64.0, -128.0
];

var floorIndices = quadVertexIndices;

