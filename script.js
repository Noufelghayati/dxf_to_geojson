      // DECLARING USEFUL VARIABLES
      let mouseMoveListenerActive = false;
      var currentID = 0;
      var current_clicked_ID = 0;
      var popup = new atlas.Popup({
        pixelOffset: [0, 0],
        closeButton: false,
        anchor: "bottom-left",
      });
      var Dragisallowed = false;
      var Rotateisallowed = false;
      var Scaleisallowed = false;
      var first_scaleFactor = 1;
      var firstclickmouseposition = [];
      var DXFs = {};
      var rotatedGeoJSON;
      var rotatedBBOX;
      var turn_white_to_black = false;
      var original_popup_position;
      var dxf_contains_coordinates = false;
      var dxf;


      // CLEANS TEXT FIELDS FROM DXF PARSED JSON -----------
      function extractText(dxfString) {
        // Regular expression to match and remove formatting tags
        var removeFormattingRegex =
          /\\A[0-2];|\\H\d+(\.\d+)?x|\\F[^;]*;|\\C\d+;|\\[LlOoKk]|\\S[^;]*;|\\W\d+(\.\d+)?;|\\Q\d+(\.\d+)?;|\\~|\\\\|;/g;
        // Regular expression to extract the text after formatting specification
        var extractTextRegex = /\\f[^;]+;([^}]*)/;

        // Extract the main text content using the second regex
        var match = dxfString.match(extractTextRegex);
        var extractedText = match ? match[1] : dxfString;

        // Remove other formatting tags from the extracted text
        var cleanedText = extractedText.replace(removeFormattingRegex, "");

        return cleanedText;
      }



      // PARSES TEXT ANCHOR FOR TEXT ENTITIES 
      function getGeoJSONAnchor(halign, valign) {
        let anchor = "center"; // Default anchor

        // Horizontal alignment (halign)
        switch (halign) {
          case 0:
            if (valign === 1) {
              anchor = "bottom-left";
            } else if (valign === 2) {
              anchor = "left";
            } else if (valign === 3) {
              anchor = "top-left";
            } else {
              anchor = "left";
            }
            break;
          case 1:
            if (valign === 1) {
              anchor = "bottom";
            } else if (valign === 2) {
              anchor = "center";
            } else if (valign === 3) {
              anchor = "top";
            } else {
              anchor = "center";
            }
            break;
          case 2:
            if (valign === 1) {
              anchor = "bottom-right";
            } else if (valign === 2) {
              anchor = "right";
            } else if (valign === 3) {
              anchor = "top-right";
            } else {
              anchor = "right";
            }
            break;
          default:
            anchor = "center";
        }

        return anchor;
      }


      // RADIAN TO DEGREE
      function radiansToDegrees(radians) {
        return radians * (180 / Math.PI);
      }

      // DEGREE TO RADIAN
      function degreesToRadians(degrees) {
        return degrees * (Math.PI / 180);
      }

      // CONVERTING CIRCLES TO LINES (SINCE GEOJSON DOESN'T HAVE CIRCLE FEATURE). -HIGHER SEGMENTS MEANS HIGHER RESOLUTION, HIGHER SEG NUMBERS MAY SLOW DOWN THE PERFORMANCE-
      function convertCircleToLines(circle, segments = 100) {
        const lines_geojson = {
          type: "LineString",
          coordinates: [],
        };
        const angleIncrement = (2 * Math.PI) / segments;

        for (let i = 0; i < segments; i++) {
          const startAngle = i * angleIncrement;
          const endAngle = startAngle + angleIncrement;
          const startPoint = calculatePoint(
            circle.center,
            circle.radius,
            startAngle
          );
          const endPoint = calculatePoint(
            circle.center,
            circle.radius,
            endAngle
          );

          lines_geojson.coordinates.push([startPoint.x, startPoint.y]);
          lines_geojson.coordinates.push([endPoint.x, endPoint.y]);
        }
        return lines_geojson;
      }

      // USEFUL FOR CONVERTING CIRCLES/ARCS TO LINE - DEFINING START AND END POINTS BASED ON RADIUS AND ANGLE
      function calculatePoint(center, radius, angle) {
        return {
          x: center.x + radius * Math.cos(angle),
          y: center.y + radius * Math.sin(angle),
        };
      }

      // CONVERTS ARC ENTITIES TO LINES - SIMILAR TO CIRCLE TO LINES SEGMENTS
      function convertArcToLines(arc, segments = 20) {
        const lines_geojson = {
          type: "LineString",
          coordinates: [],
        };
        const angleIncrement = arc.angleLength / segments;

        for (let i = 0; i < segments; i++) {
          const startAngle = arc.startAngle + i * angleIncrement;
          const endAngle = startAngle + angleIncrement;
          const startPoint = calculatePoint(arc.center, arc.radius, startAngle);
          const endPoint = calculatePoint(arc.center, arc.radius, endAngle);

          lines_geojson.coordinates.push([startPoint.x, startPoint.y]);
          lines_geojson.coordinates.push([endPoint.x, endPoint.y]);
        }
        return lines_geojson;
      }

      // DXF INT COLORS TO HEX COLORS - TAKES IN CONSIDERATION THE "WHITE TO BLACK" FEATURE
      function intToHexColor(intColor) {
        if (intColor) {
          const hexColor = intColor.toString(16).padStart(6, "0");
          if (
            turn_white_to_black === true &&
            hexColor.toLowerCase() === "#ffffff"
          ) {
            return `#000000`;
          } else {
            return `#${hexColor}`;
          }
        } else {
          if (turn_white_to_black === true) {
            return "#000000";
          } else {
            return `#ffffff`;
          }
        }
      }

      // SOMETIMES THE COLORS ARE IN AUTOCADCOLOR INDEX FORMAT, THIS FUNCTION CONVERTS IT TO HEX
      function autocadColorIndexToHex(colorIndex) {
        const autocadColorTable = [
          "#000000",
          "#ff0000",
          "#00ff00",
          "#0000ff",
          "#ffff00",
          "#ff00ff",
          "#00ffff",
          "#ffffff",
          "#808080",
          "#c0c0c0",
          "#800000",
          "#808000",
          "#008000",
          "#800080",
          "#008080",
          "#000080",
          "#ffa500",
          "#a52a2a",
          "#8b0000",
          "#808000",
          "#6b8e23",
          "#556b2f",
          "#2e8b57",
          "#3cb371",
          "#4682b4",
          "#1e90ff",
          "#4169e1",
          "#8a2be2",
          "#9932cc",
          "#c71585",
          "#ff4500",
          "#d2691e",
        ];
        if (
          turn_white_to_black === true &&
          autocadColorTable[colorIndex] === "#ffffff"
        ) {
          return "#000000";
        } else {
          return autocadColorTable[colorIndex] || "#000000";
        }
      }

      // CONVERTING X AND Y EDGES OF HATCH ENTITY TO GEOJSON POLYGON
      function convertHatchToPolygon(hatch) {
        const coordinates = hatch.edges.map((edge) => [edge.x, edge.y]);
        coordinates.push(coordinates[0]);
        return {
          type: "Polygon",
          coordinates: [coordinates],
        };
      }

      // CREATES 4 CORNER POINTS OF A POLYGON - RETURNS GEOJSON FEATURE COLLECTION OF POINTS
      const createCornerPointsfromPolygon = (polygon) => {
        const coordinates = polygon.geometry.coordinates[0];
        const points = coordinates.slice(0, -1); // Removing the last point as it's a duplicate of the first one

        const pointFeatures = points.map((point) => ({
          type: "Feature",
          geometry: {
            type: "Point",
            coordinates: point,
          },
          properties: {},
        }));

        return {
          type: "FeatureCollection",
          features: pointFeatures,
        };
      };

      // CALCULATE TOP CENTER POINT OF POLYGON, USEFUL FOR ROTATE ICON
      const calculateTopCenterPoint = (polygon) => {
        polygon1 = JSON.stringify(polygon);
        polygon2 = JSON.parse(polygon1);
        const coordinates = polygon2.geometry.coordinates[0];
        coordinates.sort((a, b) => b[1] - a[1]);

        // Ensure that the top two points are the highest latitude points
        const topTwoPoints = coordinates.slice(0, 2);

        // Calculate the midpoint between the top two points using Turf.js
        const point1 = turf.point(topTwoPoints[0]);
        const point2 = turf.point(topTwoPoints[1]);
        const midpoint = turf.midpoint(point1, point2);

        return midpoint;
      };

      // GET TOP LEFT COORDINATES OF GEOJSON POLYGON, USEFUL FOR TOOLBAR POSITION
      function getTopLeftCoordinates(coordinates) {
        let topLeft = coordinates[0];

        coordinates.forEach((coord) => {
          if (
            coord[1] > topLeft[1] ||
            (coord[1] === topLeft[1] && coord[0] < topLeft[0])
          ) {
            topLeft = coord;
          }
        });

        return topLeft;
      }

      // CONVERTS PARSED DXF JSON TO GEOJSON
      function convertToGeoJSON(dxf, unit_to_scale_text) {
        const layerColors = {};
        if (dxf.tables) {
          if (dxf.tables.layer) {
            if (dxf.tables.layer.layers) {
              for (const layerName in dxf.tables.layer.layers) {
                if (dxf.tables.layer.layers.hasOwnProperty(layerName)) {
                  const intColor = dxf.tables.layer.layers[layerName].color;
                  layerColors[layerName] = intToHexColor(intColor);
                }
              }
            }
          }
        }

        var extMin;
        var extMax;

        //CHECKS IF HEADER HAS EXTMIN AND EXTMAX PROPERTIES. AND IF IT HAS LONGITUDE/LATITUDE CENTER COORDINATE
        if (dxf.header) {
          extMin = dxf.header.$EXTMIN;
          extMax = dxf.header.$EXTMAX;
          if (dxf.header.$LATITUDE && dxf.header.$LONGITUDE) {
            dxf_contains_coordinates = true;
          } else {
            dxf_contains_coordinates = false;
          }
        }

        const entities = [];

        dxf.entities.forEach((entity) => {
          // DEFINING THE LAYER COLOR, IF NONE THEN SET TO WHITE HEX
          const layerColor = layerColors[entity.layer] || "#ffffff";
          let geometry;
          let fillColor = layerColor;
          console.log(layerColor);

          // Check if color is already available
          if (entity.color !== undefined) {
            fillColor = intToHexColor(entity.color);
          } else if (entity.colorIndex !== undefined) {
            fillColor = autocadColorIndexToHex(entity.colorIndex);
          }

          if (
            fillColor.toLowerCase() === "#ffffff" &&
            turn_white_to_black === true
          ) {
            fillColor = "#000000";
          }

          switch (entity.type) {
            case "LINE":
              geometry = {
                type: "LineString",
                coordinates: [
                  [entity.vertices[0].x, entity.vertices[0].y],
                  [entity.vertices[1].x, entity.vertices[1].y],
                ],
              };
              break;
            case "LWPOLYLINE":
            case "POLYLINE":
              const coordinates = entity.vertices.map((vertex) => [
                vertex.x,
                vertex.y,
              ]);
              if (entity.shape) {
                coordinates.push(coordinates[0]);
              }
              geometry = {
                type: "LineString",
                coordinates: coordinates,
              };
              break;
            case "ARC":
              geometry = convertArcToLines(entity);
              break;
            case "CIRCLE":
              geometry = convertCircleToLines(entity);
              break;
            case "TEXT":
              geometry = {
                type: "Point",
                coordinates: [entity.startPoint.x, entity.startPoint.y],
              };
              attachmentPoint = "bottom-left";
              if (entity.halign && entity.valign) {
                attachmentPoint = getGeoJSONAnchor(
                  entity.halign,
                  entity.valign
                );
              }
              // ROTATION IN DXF IS COUNTERCLOCKWISE, THAT'S WHY WE ARE USING 360 -
              rotation = 360;
              if (entity.rotation) {
                rotation = entity.rotation;
              }
              entities.push({
                type: "Feature",
                geometry: geometry,
                properties: {
                  layer: entity.layer,
                  color: fillColor,
                  text: extractText(entity.text).replaceAll("\\P", "\n"),
                  height: entity.textHeight * unit_to_scale_text,
                  attachmentPoint: attachmentPoint,
                  rotation: 360 - rotation,
                },
              });
              return;
            case "MTEXT":
              geometry = {
                type: "Point",
                coordinates: [entity.position.x, entity.position.y],
              };
              attachmentPoint = "top-left";
              if (entity.attachmentPoint !== undefined) {
                if (entity.attachmentPoint === 1) {
                  attachmentPoint = "top-left";
                } else if (entity.attachmentPoint === 2) {
                  attachmentPoint = "top";
                } else if (entity.attachmentPoint === 3) {
                  attachmentPoint = "top-right";
                } else if (entity.attachmentPoint === 4) {
                  attachmentPoint = "left";
                } else if (entity.attachmentPoint === 5) {
                  attachmentPoint = "center";
                } else if (entity.attachmentPoint === 6) {
                  attachmentPoint = "right";
                } else if (entity.attachmentPoint === 7) {
                  attachmentPoint = "bottom-left";
                } else if (entity.attachmentPoint === 8) {
                  attachmentPoint = "bottom";
                } else if (entity.attachmentPoint === 9) {
                  attachmentPoint = "bottom-right";
                }
              }
              entities.push({
                type: "Feature",
                geometry: geometry,
                properties: {
                  layer: entity.layer,
                  color: fillColor,
                  text: extractText(entity.text).replaceAll("\\P", "\n"),
                  attachmentPoint: entity.attachmentPoint,
                  drawingDirection: entity.drawingDirection,
                  height: entity.height * unit_to_scale_text,
                  attachmentPoint: attachmentPoint,
                  rotation: 360 - entity.mtextOrientation,
                },
              });
              return;
            case "DIMENSION":
              const block = dxf.blocks[entity.block];
              if (block) {
                block.entities.forEach((blockEntity) => {
                  let blockGeometry;
                  switch (blockEntity.type) {
                    case "ARC":
                      //console.log(blockEntity);
                      blockGeometry = convertArcToLines(blockEntity);
                      entities.push({
                        type: "Feature",
                        geometry: blockGeometry,
                        properties: {
                          layer: blockEntity.layer,
                          FillColor: intToHexColor(blockEntity.color),
                        },
                      });
                      return;
                    case "LINE":
                      blockGeometry = {
                        type: "LineString",
                        coordinates: [
                          [
                            blockEntity.vertices[0].x,
                            blockEntity.vertices[0].y,
                          ],
                          [
                            blockEntity.vertices[1].x,
                            blockEntity.vertices[1].y,
                          ],
                        ],
                      };
                      entities.push({
                        type: "Feature",
                        geometry: blockGeometry,
                        properties: {
                          layer: blockEntity.layer,
                          FillColor: intToHexColor(blockEntity.color),
                        },
                      });
                      return;
                    case "POLYLINE":
                    case "LWPOLYLINE":
                      const blockCoordinates = blockEntity.vertices.map(
                        (vertex) => [vertex.x, vertex.y]
                      );
                      if (blockEntity.shape) {
                        blockCoordinates.push(blockCoordinates[0]);
                      }
                      blockGeometry = {
                        type: "LineString",
                        coordinates: blockCoordinates,
                      };
                      break;
                    case "MTEXT":
                      blockGeometry = {
                        type: "Point",
                        coordinates: [
                          blockEntity.position.x,
                          blockEntity.position.y,
                        ],
                      };
                      attachmentPoint = "top-left";
                      if (blockEntity.attachmentPoint !== undefined) {
                        if (blockEntity.attachmentPoint === 1) {
                          attachmentPoint = "top-left";
                        } else if (blockEntity.attachmentPoint === 2) {
                          attachmentPoint = "top";
                        } else if (blockEntity.attachmentPoint === 3) {
                          attachmentPoint = "top-right";
                        } else if (blockEntity.attachmentPoint === 4) {
                          attachmentPoint = "left";
                        } else if (blockEntity.attachmentPoint === 5) {
                          attachmentPoint = "center";
                        } else if (blockEntity.attachmentPoint === 6) {
                          attachmentPoint = "right";
                        } else if (blockEntity.attachmentPoint === 7) {
                          attachmentPoint = "bottom-left";
                        } else if (blockEntity.attachmentPoint === 8) {
                          attachmentPoint = "bottom";
                        } else if (blockEntity.attachmentPoint === 9) {
                          attachmentPoint = "bottom-right";
                        }
                      }
                      entities.push({
                        type: "Feature",
                        geometry: blockGeometry,
                        properties: {
                          layer: blockEntity.layer,
                          color: fillColor,
                          text: extractText(blockEntity.text).replaceAll(
                            "\\P",
                            "\n"
                          ),
                          height: blockEntity.height * unit_to_scale_text,
                          attachmentPoint: attachmentPoint,
                          rotation: 360 - blockEntity.mtextOrientation,
                        },
                      });
                      return;
                    case "TEXT":
                      blockGeometry = {
                        type: "Point",
                        coordinates: [
                          blockEntity.startPoint.x,
                          blockEntity.startPoint.y,
                        ],
                      };
                      attachmentPoint = "bottom-left";
                      if (blockEntity.halign && blockEntity.valign) {
                        attachmentPoint = getGeoJSONAnchor(
                          blockEntity.halign,
                          blockEntity.valign
                        );
                      }
                      rotation = 360;
                      if (blockEntity.rotation) {
                        rotation = blockEntity.rotation;
                      }
                      entities.push({
                        type: "Feature",
                        geometry: blockGeometry,
                        properties: {
                          layer: blockEntity.layer,
                          color: fillColor,
                          text: extractText(blockEntity.text).replaceAll(
                            "\\P",
                            "\n"
                          ),
                          height: blockEntity.textHeight * unit_to_scale_text,
                          attachmentPoint: attachmentPoint,
                          rotation: 360 - rotation,
                        },
                      });
                      return;
                    default:
                      return;
                  }
                  entities.push({
                    type: "Feature",
                    geometry: blockGeometry,
                    properties: {
                      layer: blockEntity.layer,
                      color: fillColor,
                    },
                  });
                });
              }
              return;
            case "INSERT":
              if (entity.name && dxf.blocks[entity.name]) {
                const insertedBlock = dxf.blocks[entity.name];
                let wholefeaturecollection = {
                  type: "FeatureCollection",
                  features: [],
                };
                insertedBlock.entities.forEach((blockEntity) => {
                  let blockGeometry;

                  var adjustedPosition;

                  if (entity.extrusionDirection) {
                    adjustedPosition = {
                      x: -1 * entity.position.x,
                      y: entity.position.y,
                    };
                  } else {
                    adjustedPosition = {
                      x: entity.position.x,
                      y: entity.position.y,
                    };
                  }
                  switch (blockEntity.type) {
                    case "LINE":
                      blockGeometry = {
                        type: "LineString",
                        coordinates: [
                          [
                            blockEntity.vertices[0].x + adjustedPosition.x,
                            blockEntity.vertices[0].y + adjustedPosition.y,
                          ],
                          [
                            blockEntity.vertices[1].x + adjustedPosition.x,
                            blockEntity.vertices[1].y + adjustedPosition.y,
                          ],
                        ],
                      };
                      break;
                    case "POLYLINE":
                    case "LWPOLYLINE":
                      const blockCoordinates = blockEntity.vertices.map(
                        (vertex) => [
                          vertex.x + adjustedPosition.x,
                          vertex.y + adjustedPosition.y,
                        ]
                      );
                      if (blockEntity.shape) {
                        blockCoordinates.push(blockCoordinates[0]);
                      }
                      blockGeometry = {
                        type: "LineString",
                        coordinates: blockCoordinates,
                      };
                      break;
                    case "ARC":
                      const arcCenter = {
                        x: blockEntity.center.x + adjustedPosition.x,
                        y: blockEntity.center.y + adjustedPosition.y,
                      };
                      blockGeometry = convertArcToLines({
                        ...blockEntity,
                        center: arcCenter,
                      });
                      break;
                    case "CIRCLE":
                      const circleCenter = {
                        x: blockEntity.center.x + adjustedPosition.x,
                        y: blockEntity.center.y + adjustedPosition.y,
                      };
                      blockGeometry = convertCircleToLines({
                        ...blockEntity,
                        center: circleCenter,
                      });
                      break;
                    case "MTEXT":
                      blockGeometry = {
                        type: "Point",
                        coordinates: [
                          blockEntity.position.x + adjustedPosition.x,
                          blockEntity.position.y + adjustedPosition.y,
                        ],
                      };
                      attachmentPoint = "top-left";
                      if (blockEntity.attachmentPoint !== undefined) {
                        if (blockEntity.attachmentPoint === 1) {
                          attachmentPoint = "top-left";
                        } else if (blockEntity.attachmentPoint === 2) {
                          attachmentPoint = "top";
                        } else if (blockEntity.attachmentPoint === 3) {
                          attachmentPoint = "top-right";
                        } else if (blockEntity.attachmentPoint === 4) {
                          attachmentPoint = "left";
                        } else if (blockEntity.attachmentPoint === 5) {
                          attachmentPoint = "center";
                        } else if (blockEntity.attachmentPoint === 6) {
                          attachmentPoint = "right";
                        } else if (blockEntity.attachmentPoint === 7) {
                          attachmentPoint = "bottom-left";
                        } else if (blockEntity.attachmentPoint === 8) {
                          attachmentPoint = "bottom";
                        } else if (blockEntity.attachmentPoint === 9) {
                          attachmentPoint = "bottom-right";
                        }
                      }
                      entities.push({
                        type: "Feature",
                        geometry: blockGeometry,
                        properties: {
                          layer: blockEntity.layer,
                          color: fillColor,
                          text: extractText(blockEntity.text).replaceAll(
                            "\\P",
                            "\n"
                          ),
                          height: blockEntity.height * unit_to_scale_text,
                          attachmentPoint: attachmentPoint,
                          rotation: 360 - blockEntity.mtextOrientation,
                        },
                      });
                      return;
                    case "TEXT":
                      blockGeometry = {
                        type: "Point",
                        coordinates: [
                          blockEntity.startPoint.x + adjustedPosition.x,
                          blockEntity.startPoint.y + adjustedPosition.y,
                        ],
                      };
                      attachmentPoint = "bottom-left";
                      if (blockEntity.halign && blockEntity.valign) {
                        attachmentPoint = getGeoJSONAnchor(
                          blockEntity.halign,
                          blockEntity.valign
                        );
                      }
                      rotation = 360;
                      if (blockEntity.rotation) {
                        rotation = blockEntity.rotation;
                      }
                      entities.push({
                        type: "Feature",
                        geometry: blockGeometry,
                        properties: {
                          layer: blockEntity.layer,
                          color: fillColor,
                          text: extractText(blockEntity.text).replaceAll(
                            "\\P",
                            "\n"
                          ),
                          height: blockEntity.textHeight * unit_to_scale_text,
                          attachmentPoint: attachmentPoint,
                          rotation: 360 - rotation,
                        },
                      });
                      return;
                    default:
                      return;
                  }
                  if (entity.rotation) {
                    wholefeaturecollection.features.push({
                      type: "Feature",
                      geometry: blockGeometry,
                      properties: {
                        layer: blockEntity.layer,
                        color: fillColor,
                      },
                    });
                  } else {
                    entities.push({
                      type: "Feature",
                      geometry: blockGeometry,
                      properties: {
                        layer: blockEntity.layer,
                        color: fillColor,
                      },
                    });
                  }
                });

                // EXTRUSIONDIRECTION IS SET WHEN BLOCKS ARE MIRRORED, SETS THE ROTATION ACCORDINGLY
                if (wholefeaturecollection.features.length > 0) {
                  if (entity.extrusionDirection) {
                    wholefeaturecollection = rotateFeatureCollection(
                      wholefeaturecollection,
                      180
                    );
                    wholefeaturecollection = rotateFeatureCollection(
                      wholefeaturecollection,
                      360 - entity.rotation
                    );
                  } else {
                    wholefeaturecollection = rotateFeatureCollection(
                      wholefeaturecollection,
                      entity.rotation
                    );
                  }

                  wholefeaturecollection.features.forEach((feature) => {
                    entities.push(feature);
                  });
                }
              }
              return;
            case "HATCH":
              geometry = convertHatchToPolygon(entity);
              entities.push({
                type: "Feature",
                geometry: geometry,
                properties: {
                  layer: entity.layer,
                  color: fillColor,
                  FillColor: fillColor,
                },
              });
              return;
            default:
              return;
          }

          entities.push({
            type: "Feature",
            geometry: geometry,
            properties: {
              layer: entity.layer,
              color: fillColor,
              FillColor: fillColor,
            },
          });
        });


        geojson = {
          type: "FeatureCollection",
          features: entities,
        };
        
        // CONVERTS CENTER TO 500,500 SO WE HAVE STANDARD COORDINATES, THEN MOVES THE DXF
        var newCenter = [500, 500];
        var bounds = turf.bbox(geojson);
        var currentCenter = [
          (bounds[0] + bounds[2]) / 2,
          (bounds[1] + bounds[3]) / 2,
        ];
        var dx = newCenter[0] - currentCenter[0];
        var dy = newCenter[1] - currentCenter[1];

        // Move all features by the difference
        geojson.features.forEach((feature) => {
          switch (feature.geometry.type) {
            case "Point":
              feature.geometry.coordinates[0] += dx;
              feature.geometry.coordinates[1] += dy;
              break;
            case "LineString":
              feature.geometry.coordinates = feature.geometry.coordinates.map(
                (coord) => {
                  return [coord[0] + dx, coord[1] + dy];
                }
              );
              break;
            case "Polygon":
              feature.geometry.coordinates = feature.geometry.coordinates.map(
                (ring) => {
                  return ring.map((coord) => {
                    return [coord[0] + dx, coord[1] + dy];
                  });
                }
              );
              break;
          }
        });

        return geojson;
      }

      // ADJUST THE COORDINATES BY ADDING X AND Y NUMBER
      function adjustGeoJSONCoordinates(geojson, x, y) {
        const adjustCoordinates = (coordinates) => {
          return coordinates.map((coord) => [coord[0] + x, coord[1] + y]);
        };

        geojson.features.forEach((feature) => {
          switch (feature.geometry.type) {
            case "Point":
              feature.geometry.coordinates[0] += x;
              feature.geometry.coordinates[1] += y;
              break;
            case "LineString":
              feature.geometry.coordinates = adjustCoordinates(
                feature.geometry.coordinates
              );
              break;
            case "Polygon":
              feature.geometry.coordinates[0] = adjustCoordinates(
                feature.geometry.coordinates[0]
              );
              break;
            // Add cases for other geometry types if needed
          }
        });

        return geojson;
      }

      // DIALOG OPENING WHEN USERS WANT TO IMPORT DXF
      $("#openDialog").on("click", function () {
        $.confirm({
          title: "DXF Import",
          content:
            "" +
            '<form action="" class="import_form">' +
            '<div class="form-group">' +
            "<label>Please select the DXF file and specify the units used in the file:</label>" +
            '<select class="units">' +
            '<option value="m" selected>Metres</option>' +
            '<option value="cm">Centimetres</option>' +
            '<option value="mm">Millimetres</option>' +
            '<option value="ft">Feet</option>' +
            '<option value="in">Inch</option>' +
            "</select>" +
            "<br><br>" +
            "<label>Select File:</label>" +
            '<input type="file" class="dxf-file" accept=".dxf">' +
            "<br><br>" +
            '<input type="checkbox" id="auto-black" class="auto-black" style="display:unset" checked>' +
            '<label for="auto-black"> Automatically turn white objects to black for increased visibility</label>' +
            "</div>" +
            "</form>",
          buttons: {
            import: {
              text: "Import",
              btnClass: "btn-red",
              action: function () {
                // CHECKS IF WHITE TO BLACK FEATURE IS CHECKED
                if (this.$content.find("#auto-black").is(":checked")) {
                  turn_white_to_black = true;
                }
                // INCREMENTS THE CURRENTID
                currentID = currentID + 1;
                DXFs[currentID] = {};
                var units = this.$content.find(".units").val();
                var fileInput = this.$content.find(".dxf-file")[0];
                var file = fileInput.files[0];

                var reader = new FileReader();
                reader.readAsText(file);
                reader.onload = function (e) {
                  // INITIALIZING DATASOURCES
                  DXFs[currentID].Polygons_dataSource =
                    new atlas.source.DataSource();
                  map.sources.add(DXFs[currentID].Polygons_dataSource);
                  DXFs[currentID].Polylines_dataSource =
                    new atlas.source.DataSource();
                  map.sources.add(DXFs[currentID].Polylines_dataSource);
                  DXFs[currentID].Bounds_dataSource =
                    new atlas.source.DataSource();
                  map.sources.add(DXFs[currentID].Bounds_dataSource);
                  DXFs[currentID].Scale_Points_dataSource =
                    new atlas.source.DataSource();
                  map.sources.add(DXFs[currentID].Scale_Points_dataSource);
                  DXFs[currentID].Rotate_Point_dataSource =
                    new atlas.source.DataSource();
                  map.sources.add(DXFs[currentID].Rotate_Point_dataSource);

                  // ROTATION ANGLE SET TO 0
                  DXFs[currentID].rotation_angle = 0;

                  //FILE NAME ADDED TO DXF OBJECT
                  DXFs[currentID].filename = file.name;

                  // INITIALIZING LAYERS
                  DXFs[currentID].polygonLayer = new atlas.layer.PolygonLayer(
                    DXFs[currentID].Polygons_dataSource,
                    null,
                    {
                      fillColor: ["get", "FillColor"],
                      strokeWidth: 0,
                      fillOpacity: 1,
                    }
                  );
                  DXFs[currentID].polylineLayer = new atlas.layer.LineLayer(
                    DXFs[currentID].Polylines_dataSource,
                    null,
                    {
                      strokeColor: ["get", "FillColor"],
                      strokeWidth: 1,
                    }
                  );
                  DXFs[currentID].BoundsLayer = new atlas.layer.PolygonLayer(
                    DXFs[currentID].Bounds_dataSource,
                    null,
                    {
                      fillColor: "#0ffcfc",
                      strokeWidth: 0,
                      fillOpacity: 0,
                      visible: true,
                    }
                  );
                  DXFs[currentID].BoundsLayer_outline =
                    new atlas.layer.LineLayer(
                      DXFs[currentID].Bounds_dataSource,
                      null,
                      {
                        strokeColor: "red",
                        strokeWidth: 2,
                        strokeDashArray: [1, 4],
                        visible: false,
                      }
                    );
                  DXFs[currentID].Scale_Points_Layer =
                    new atlas.layer.SymbolLayer(
                      DXFs[currentID].Scale_Points_dataSource,
                      null,
                      {
                        iconOptions: {
                          image: "scale_icon",
                          size: 0.5,
                          allowOverlap: true,
                        },
                        visible: false,
                      }
                    );

                  DXFs[currentID].Rotate_Point_Layer =
                    new atlas.layer.SymbolLayer(
                      DXFs[currentID].Rotate_Point_dataSource,
                      null,
                      {
                        iconOptions: {
                          image: "rotate_icon",
                          size: 1,
                          offset: [0, -10],
                        },
                        visible: false,
                      }
                    );

                    // SOURCE PROJECTION SET BY DEFAULT TO EPSG 3857, CAN BE ALTERED LATER
                  const sourceProjection = "EPSG:3857";
                  const destProjection = "EPSG:4326";
                  proj4.defs(
                    sourceProjection,
                    "+proj=merc +a=6378137 +b=6378137 +lat_ts=0 +lon_0=0 +x_0=0 +y_0=0 +k=1 +units=m +nadgrids=@null +wktext +no_defs +type=crs"
                  );
                  proj4.defs(
                    destProjection,
                    "+proj=longlat +datum=WGS84 +no_defs"
                  );

                  // FUNCTION TO REPROJECT COORDINATES
                  function reprojectCoordinates(coordinates) {
                    if (typeof coordinates[0] === "number") {
                      return proj4(
                        sourceProjection,
                        destProjection,
                        coordinates
                      );
                    } else {
                      return coordinates.map(reprojectCoordinates);
                    }
                  }

                  // ADDING LAYER TO MAP
                  map.layers.add(DXFs[currentID].polygonLayer);
                  map.layers.add(DXFs[currentID].polylineLayer);
                  map.layers.add(DXFs[currentID].BoundsLayer);
                  map.layers.add(DXFs[currentID].BoundsLayer_outline);
                  map.layers.add(DXFs[currentID].Scale_Points_Layer);
                  map.layers.add(DXFs[currentID].Rotate_Point_Layer);

                  // PARSING DXF TO JSON
                  var fileText = e.target.result;
                  var parser = new DxfParser();
                  dxf = null;
                  try {
                    dxf = parser.parseSync(fileText);
                    console.log("DXF parsed successfully:", dxf);
                  } catch (err) {
                    return console.error("Error parsing DXF:", err.stack);
                  }

                  // SETTING THE TEXT PIXEL DEPENDING ON UNIT.
                  // ON ZOOM OF 25, there would be approximately 315 pixels per meter.
                  if (units === "m") {
                    geojson = convertToGeoJSON(dxf, 315);
                  } else if (units === "ft") {
                    geojson = convertToGeoJSON(dxf, 96.012);
                  } else if (units === "in") {
                    geojson = convertToGeoJSON(dxf, 8.001);
                  } else if (units === "cm") {
                    geojson = convertToGeoJSON(dxf, 3.15);
                  } else if (units === "mm") {
                    geojson = convertToGeoJSON(dxf, 0.315);
                  }

                  // CALCULATE MEAN TEXT HEIGHT
                  DXFs[currentID].mean_text_height =
                    calculateMeanHeight(geojson);

                    // CALCULATES CURRENT UTM ZONE, SETS THE SOURCE PROJECTION TO THAT UTM
                  utmzonenumber =
                    Math.floor((map.getCamera().center[0] + 180) / 6) + 1;

                  if (utmzonenumber >= 1 && utmzonenumber <= 23) {
                    proj4.defs(
                      sourceProjection,
                      `+proj=utm +zone=${utmzonenumber} +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs +type=crs`
                    );
                  }

                  // CONVERTS MAP CENTER COORDINATES TO UTM OR MERCATOR PROJECTION
                  coooordinates = proj4(
                    destProjection,
                    sourceProjection,
                    map.getCamera().center
                  );

                  // ADJUSTS GEOJSON TO CURRENT COORDINATES
                  geojson = adjustGeoJSONCoordinates(
                    geojson,
                    coooordinates[0],
                    coooordinates[1]
                  );

                  if (geojson.features.length < 1) {
                    alert("No entities found in imported DXF!");
                    return;
                  }

                  // SCALES THE GEOJSON BY UNIT AND SCALE FACTOR
                  if (units === "m") {
                    first_scaleFactor = 1;
                  } else if (units === "ft") {
                    first_scaleFactor = 0.3048;
                  } else if (units === "in") {
                    first_scaleFactor = 0.0254;
                  } else if (units === "cm") {
                    first_scaleFactor = 0.01;
                  } else if (units === "mm") {
                    first_scaleFactor = 0.001;
                  }

                  DXFs[currentID].scaledGeoJSON = scaleGeoJSON(
                    geojson,
                    first_scaleFactor
                  );

                  // REPROJECT THE SCALED GEOJSON 
                  const reprojectedFeatures = DXFs[
                    currentID
                  ].scaledGeoJSON.features.map((feature) => {
                    feature.geometry.coordinates = reprojectCoordinates(
                      feature.geometry.coordinates
                    );
                    return feature;
                  });

                  DXFs[currentID].reprojectedGeoJSON =
                    turf.featureCollection(reprojectedFeatures);

                    // IF DXF CONTAINS LONGITUDE AND LATITUDE CENTER COORDINATES, MOVES ITS CENTER TO IT
                  if (dxf_contains_coordinates) {
                    newCenter = [dxf.header.$LONGITUDE, dxf.header.$LATITUDE];
                  } else {
                    newCenter = map.getCamera().center;
                  }
                  bounds = turf.bbox(DXFs[currentID].reprojectedGeoJSON);
                  currentCenter = [
                    (bounds[0] + bounds[2]) / 2,
                    (bounds[1] + bounds[3]) / 2,
                  ];
                  dx = newCenter[0] - currentCenter[0];
                  dy = newCenter[1] - currentCenter[1];
                  DXFs[currentID].reprojectedGeoJSON.features.forEach(
                    (feature) => {
                      switch (feature.geometry.type) {
                        case "Point":
                          feature.geometry.coordinates[0] += dx;
                          feature.geometry.coordinates[1] += dy;
                          break;
                        case "LineString":
                          feature.geometry.coordinates =
                            feature.geometry.coordinates.map((coord) => {
                              return [coord[0] + dx, coord[1] + dy];
                            });
                          break;
                        case "Polygon":
                          feature.geometry.coordinates =
                            feature.geometry.coordinates.map((ring) => {
                              return ring.map((coord) => {
                                return [coord[0] + dx, coord[1] + dy];
                              });
                            });
                          break;
                      }
                    }
                  );

                  bbox = turf.bbox(DXFs[currentID].reprojectedGeoJSON);
                  DXFs[currentID].bboxPolygon = turf.bboxPolygon(bbox);

                  // ADDS NEW TEXT ON THE CORNER IF TITLE AND AUTHOR PROPERTIES ARE FOUND IN DXF HEADER
                  if (dxf.header) {
                    if (dxf.header["$TITLE"] && !dxf.header["$AUTHOR"]) {
                      DXFs[currentID].reprojectedGeoJSON.features.push({
                        type: "Feature",
                        properties: {
                          text:
                            "TITLE: " +
                            dxf.header["$TITLE"] +
                            "\nFILE: " +
                            DXFs[currentID].filename,
                          color: "#000000",
                          offset: [1, 1],
                          height: 12,
                          attachmentPoint: "top-left",
                          rotation: 0,
                          rotation_ref: true,
                        },
                        geometry: {
                          coordinates: getTopLeftCoordinates(
                            DXFs[currentID].bboxPolygon.geometry.coordinates[0]
                          ),
                          type: "Point",
                        },
                      });
                    } else if (!dxf.header["$TITLE"] && dxf.header["$AUTHOR"]) {
                      DXFs[currentID].reprojectedGeoJSON.features.push({
                        type: "Feature",
                        properties: {
                          text:
                            "AUTHOR: " +
                            dxf.header["$AUTHOR"] +
                            "\nFILE: " +
                            DXFs[currentID].filename,
                          color: "#000000",
                          offset: [1, 1],
                          height: 12,
                          attachmentPoint: "top-left",
                          rotation: 0,
                          rotation_ref: true,
                        },
                        geometry: {
                          coordinates: getTopLeftCoordinates(
                            DXFs[currentID].bboxPolygon.geometry.coordinates[0]
                          ),
                          type: "Point",
                        },
                      });
                    } else if (dxf.header["$TITLE"] && dxf.header["$AUTHOR"]) {
                      DXFs[currentID].reprojectedGeoJSON.features.push({
                        type: "Feature",
                        properties: {
                          text:
                            "AUTHOR: " +
                            dxf.header["$AUTHOR"] +
                            "\nTITLE: " +
                            dxf.header["$TITLE"] +
                            "\nFILE: " +
                            DXFs[currentID].filename,
                          color: "#000000",
                          offset: [1, 1],
                          height: 12,
                          attachmentPoint: "top-left",
                          rotation: 0,
                          rotation_ref: true,
                        },
                        geometry: {
                          coordinates: getTopLeftCoordinates(
                            DXFs[currentID].bboxPolygon.geometry.coordinates[0]
                          ),
                          type: "Point",
                        },
                      });
                    } else if (
                      !dxf.header["$TITLE"] &&
                      !dxf.header["$AUTHOR"]
                    ) {
                      DXFs[currentID].reprojectedGeoJSON.features.push({
                        type: "Feature",
                        properties: {
                          text: "\n FILE: " + DXFs[currentID].filename,
                          color: "#000000",
                          offset: [1, 1],
                          height: 12,
                          attachmentPoint: "top-left",
                          rotation: 0,
                          rotation_ref: true,
                        },
                        geometry: {
                          coordinates: getTopLeftCoordinates(
                            DXFs[currentID].bboxPolygon.geometry.coordinates[0]
                          ),
                          type: "Point",
                        },
                      });
                    }
                  }


                  // CREATES TEXT LAYERS AND DATASOURCE BASED ON HEIGHT, TEXT FEATURES ARE GROUPED INTO LAYERS WITH SAME HEIGHT
                  DXFs[currentID].symbolLayersByHeight = {};
                  symbol_id = 0;
                  DXFs[currentID].reprojectedGeoJSON.features.forEach(
                    (feature) => {
                      if (feature.geometry.type === "Point") {
                        let height = feature.properties.height;
                        if (!DXFs[currentID].symbolLayersByHeight[height]) {
                          symbol_id = symbol_id + 1;
                          feature.properties.symbol_id = symbol_id;
                          DXFs[currentID].symbolLayersByHeight[height] = {
                            dataSource: new atlas.source.DataSource(),
                            layer: null,
                            height: height,
                            symbol_id: symbol_id,
                          };
                          DXFs[currentID].symbolLayersByHeight[height].layer =
                            new atlas.layer.SymbolLayer(
                              DXFs[currentID].symbolLayersByHeight[
                                height
                              ].dataSource,
                              null,
                              {
                                iconOptions: {
                                  image: "none",
                                },
                                textOptions: {
                                  rotation: ["get", "rotation"],
                                  anchor: ["get", "attachmentPoint"],
                                  justify: "auto",
                                  ignorePlacement: true,
                                  padding: 0,
                                  textField: ["get", "text"],
                                  allowOverlap: true,
                                  color: ["get", "color"],
                                  offset: ["get", "offset"],
                                  size: [
                                    "interpolate",
                                    ["exponential", 2],
                                    ["zoom"],
                                    7,
                                    2,
                                    25,
                                    height,
                                  ],
                                },
                              }
                            );
                          if (feature.properties.rotation_ref == true) {
                            DXFs[currentID].symbolLayersByHeight[
                              height
                            ].layer.setOptions({
                              textOptions: { size: height },
                            });
                          }
                          map.sources.add(
                            DXFs[currentID].symbolLayersByHeight[height]
                              .dataSource
                          );
                          map.layers.add(
                            DXFs[currentID].symbolLayersByHeight[height].layer
                          );
                          map.map.setLayoutProperty(
                            DXFs[currentID].symbolLayersByHeight[
                              height
                            ].layer.getId(),
                            "text-max-width",
                            100
                          );
                        } else {
                          feature.properties.symbol_id =
                            DXFs[currentID].symbolLayersByHeight[
                              feature.properties.height
                            ].symbol_id;
                        }
                        DXFs[currentID].symbolLayersByHeight[
                          height
                        ].dataSource.add(feature);
                      }
                    }
                  );

                  // CALCULATE CORNERS OF CURRENT GEOJSON AND SETS SCALE POINTS TO IT
                  DXFs[currentID].Scale_Points_geojson =
                    createCornerPointsfromPolygon(DXFs[currentID].bboxPolygon);

                  // CALCULATE TOP CENTER POINT FOR ROTATION ICON
                  DXFs[currentID].Rotate_Point_geojson =
                    calculateTopCenterPoint(DXFs[currentID].bboxPolygon);

                  // SETS POLYGONS AND POLYLINES SHAPES FROM FINAL GEOJSON
                  DXFs[currentID].Polygons_dataSource.setShapes(
                    DXFs[currentID].reprojectedGeoJSON.features.filter(
                      (f) => f.geometry.type === "Polygon"
                    )
                  );
                  DXFs[currentID].Polylines_dataSource.setShapes(
                    DXFs[currentID].reprojectedGeoJSON.features.filter(
                      (f) => f.geometry.type === "LineString"
                    )
                  );

                  // UPDATES TEXT LAYERS ACCORDINGLY
                  Object.keys(DXFs[currentID].symbolLayersByHeight).forEach(
                    (key) => {
                      DXFs[currentID].symbolLayersByHeight[
                        key
                      ].dataSource.clear();
                    }
                  );

                  DXFs[currentID].reprojectedGeoJSON.features.forEach(
                    (feature) => {
                      switch (feature.geometry.type) {
                        case "Point":
                          Object.keys(
                            DXFs[currentID].symbolLayersByHeight
                          ).forEach((key) => {
                            if (
                              DXFs[currentID].symbolLayersByHeight[key]
                                .height === feature.properties.height
                            ) {
                              DXFs[currentID].symbolLayersByHeight[
                                key
                              ].dataSource.add(feature);
                            }
                          });
                      }
                    }
                  );

                  DXFs[currentID].Bounds_dataSource.setShapes(
                    DXFs[currentID].bboxPolygon
                  );
                  DXFs[currentID].Scale_Points_dataSource.setShapes(
                    DXFs[currentID].Scale_Points_geojson
                  );
                  DXFs[currentID].Rotate_Point_dataSource.setShapes(
                    DXFs[currentID].Rotate_Point_geojson
                  );


                  // SETTING CAMERA BOUNDS TO DXF FILE
                  var bounds = atlas.data.BoundingBox.fromData(
                    DXFs[currentID].reprojectedGeoJSON
                  );

                  map.setCamera({
                    bounds: bounds,
                    padding: 50,
                    type: "fly",
                    duration: 2000,
                    maxZoom: 23,
                  });


                  // THIS PART IS SELECTING THE DXF FILE ONCE IMPORTED -----------------
                  current_clicked_ID = currentID;
                  popup.close();
                  DXFs[currentID].BoundsLayer_outline.setOptions({
                    visible: true,
                  });
                  topLeftCoordinates = getTopLeftCoordinates(
                    DXFs[currentID].bboxPolygon.geometry.coordinates[0]
                  );
                  popup.setOptions({
                    content: `
                        <div style="display:flex; flex-direction: row; opacity: 0.8;">
                            <div class="radio-box" style="display:none">
            <input type="radio" id="freeHand" name="mode" value="freeHand" onclick="FreeHand()" checked>
            <label for="freeHand">None</label>
        </div>
        <div>
            <img src="./images/dxf-file.png" height="32">
        </div>
        <div class="radio-box">
            <input type="radio" id="dragMode" name="mode" onclick="dragMode()" value="dragMode">
            <label for="dragMode" style="padding:0px; width:32px; height:32px; margin:0px"><img src="./images/Move_toolbar.png" style="" width="32" height="32" title="Drag"></label>
        </div>

        <div style="display:flex; flex-direction: column;">
        <div class="radio-box">
            <input type="radio" id="rotateMode" name="mode" onclick="rotateMode()" value="rotateMode">
            <label for="rotateMode" style="padding:0px; width:32px; height:32px; margin:0px"><img src="./images/Rotate_toolbar.png" style="" width="32" height="32" title="Rotate (clockwise)"></label>
        </div>

        <div style="display:none; flex-direction: row;" id="rotate_number_div">
        <input type="number" id="rotate_number" style="width:32px; height:32px">
        <button id="rotate_number_button"  onclick="Rotate_from_text1(${currentID})">Apply</button>
        </div>

        </div>

        <div style="display:flex; flex-direction: column;">
        <div class="radio-box">
            <input type="radio" id="scaleMode" name="mode" onclick="scaleMode()" value="scaleMode">
            <label for="scaleMode" style="padding:0px; width:32px; height:32px; margin:0px"><img src="./images/Scale_toolbar.png" style="" width="32" height="32" title="Scale"></label>
        </div>

        <div style="display:none; flex-direction: row;" id="scale_number_div">
        <input type="number" id="scale_number" style="width:32px; height:32px">
        <button id="scale_number_button" onclick="Scale_from_text(${currentID})">Apply</button>
        </div>

    </div>
        <div class="radio-box">
            <input type="radio" id="Delete" name="mode" onclick="Delete(${currentID})" value="Delete">
            <label for="Delete" style="padding:0px; width:32px; height:32px; margin:0px"><img src="./images/Delete_toolbar.png" style="" width="32" height="32" title="Delete (cannot be undone)"></label>
        </div>
        <div class="radio-box">
            <input type="radio" id="Reset" name="mode" onclick="Reset(${currentID})" value="Reset">
            <label for="Reset" style="padding:0px; width:32px; height:32px; margin:0px"><img src="./images/Reset_toolbar.png" style="" width="32" height="32" title="Reset the size and location to original"></label>
        </div>
        <div class="radio-box">
            <input type="radio" id="Export" name="mode" onclick="Export(${currentID})" value="Export">
            <label for="Export" style="padding:0px; width:32px; height:32px; margin:0px"><img src="./images/Export_toolbar.png" style="" width="32" height="32" title="Download GEOJSON"></label>
        </div>
        </div>
                        `,
                    position: topLeftCoordinates,
                    pixelOffset: [0, 0],
                  });
                  original_popup_position = topLeftCoordinates;
                  checkPopupInView(popup);

                  document.getElementById("rotate_number").onmousedown = () => {
                    document.getElementById("rotate_number").focus();
                  };
                  document.getElementById("scale_number").onmousedown = () => {
                    document.getElementById("scale_number").focus();
                  };
                  $("#rotate_number").keyup(function (event) {
                    if (event.keyCode === 13) {
                      $("#rotate_number_button").click();
                    }
                    if (event.key === "-") {
                      this.value = parseFloat(this.value.replace("-", ""));
                    }
                  });
                  $("#scale_number").keyup(function (event) {
                    if (event.keyCode === 13) {
                      $("#scale_number_button").click();
                    }
                    if (event.key === "-") {
                      this.value = parseFloat(this.value.replace("-", ""));
                    }
                  });

                  popup.open();
                  $(".popup-arrow").remove();
                  $(".popup-container").css("background", "#f0ffff00");
                  $(".popup-content-container").css("background", "#f0ffff00");
                  checkPopupInView(popup);



                  // CALCULATES INITIAL ANGLE IF NORTHDIRECTION EXISTS ON HEADERS - ROTATES THE DXF ACCORDINGLY
                  DXFs[currentID].initial_angle = 0;

                  if (dxf.header) {
                    if (dxf.header["$NORTHDIRECTION"]) {
                      Rotate_from_text(
                        currentID,
                        360 - dxf.header["$NORTHDIRECTION"]
                      );
                      DXFs[currentID].initial_angle =
                        360 - dxf.header["$NORTHDIRECTION"];
                    }
                  }

                  (function (id) {

                    // CURSOR CUSTOM ICON EVENTS FOR ROTATE AND SCALE MODE
                    map.events.add(
                      "mouseover",
                      DXFs[id].Scale_Points_Layer,
                      () => {
                        map.getCanvas().style.cursor =
                          "url(./images/resize_cursor.png), auto";
                      }
                    );
                    map.events.add(
                      "mouseout",
                      DXFs[id].Scale_Points_Layer,
                      () => {
                        map.getCanvas().style.cursor = "";
                      }
                    );
                    map.events.add(
                      "mouseover",
                      DXFs[id].Rotate_Point_Layer,
                      () => {
                        map.getCanvas().style.cursor =
                          "url(./images/rotate_cursor.png), auto";
                      }
                    );
                    map.events.add(
                      "mouseout",
                      DXFs[id].Rotate_Point_Layer,
                      () => {
                        map.getCanvas().style.cursor = "";
                      }
                    );




                    // ON MOUSE DOWN ON ROTATE ICON - STARTS ROTATING
                    map.events.add(
                      "mousedown",
                      DXFs[id].Rotate_Point_Layer,
                      function (e) {
                        firstclickmouseposition = [];
                        firstclickmouseposition.push(e.position[0]);
                        firstclickmouseposition.push(e.position[1]);
                        if (!mouseMoveListenerActive) {
                          // Add mousemove event listener
                          const mouseMoveHandler = function (mouseEvent) {
                            map.getCanvas().style.cursor =
                              "url(./images/rotate_cursor.png), auto";
                            var moveposition = mouseEvent.position;

                            // Calculate the angle between the center and the click position
                            angle =
                              (turf.bearing(
                                turf.centroid(DXFs[id].reprojectedGeoJSON),
                                turf.point(moveposition)
                              ) +
                                360) %
                              360;

                            // Rotate the GeoJSON features by the calculated angle
                            rotatedGeoJSON = rotateGeoJSON(
                              DXFs[id].reprojectedGeoJSON,
                              angle
                            );
                            rotatedBBOX = rotateGeoJSON(
                              DXFs[id].bboxPolygon,
                              angle
                            );

                            //console.log('Rotated GeoJSON Features:', rotatedGeoJSON);

                            DXFs[id].rotation_angle = angle;

                            // Update the map data sources with the rotated features
                            DXFs[id].Bounds_dataSource.setShapes(rotatedBBOX);
                            DXFs[id].Polygons_dataSource.setShapes(
                              rotatedGeoJSON.features.filter(
                                (f) => f.geometry.type === "Polygon"
                              )
                            );
                            DXFs[id].Polylines_dataSource.setShapes(
                              rotatedGeoJSON.features.filter(
                                (f) => f.geometry.type === "LineString"
                              )
                            );
                          };

                          DXFs[id].Rotate_Point_Layer.setOptions({
                            visible: false,
                          });
                          DXFs[id].BoundsLayer.setOptions({
                            fillOpacity: 0,
                          });

                          for (let key in DXFs[id].symbolLayersByHeight) {
                            if (
                              DXFs[id].symbolLayersByHeight.hasOwnProperty(key)
                            ) {
                              DXFs[id].symbolLayersByHeight[
                                key
                              ].layer.setOptions({
                                visible: false,
                              });
                            }
                          }
                          popup.close();
                          map.events.add("mousemove", mouseMoveHandler);
                          mouseMoveListenerActive = true;
                          map.setUserInteraction({ dragPanInteraction: false });

                          // Add a click event listener to remove the mousemove listener
                          map.events.addOnce("mouseup", function () {
                            map.events.remove("mousemove", mouseMoveHandler);
                            map.setUserInteraction({
                              dragPanInteraction: true,
                            });
                            mouseMoveListenerActive = false;
                            map.getCanvas().style.cursor = "";

                            Object.keys(DXFs[id].symbolLayersByHeight).forEach(
                              (key) => {
                                DXFs[id].symbolLayersByHeight[
                                  key
                                ].dataSource.clear();
                              }
                            );

                            rotatedGeoJSON.features.forEach(function (
                              feature,
                              index
                            ) {
                              switch (feature.geometry.type) {
                                case "Point":
                                  feature.properties.rotation =
                                    feature.properties.rotation +
                                    DXFs[id].rotation_angle;
                                  Object.keys(
                                    DXFs[id].symbolLayersByHeight
                                  ).forEach((key) => {
                                    if (
                                      DXFs[id].symbolLayersByHeight[key]
                                        .symbol_id ===
                                      feature.properties.symbol_id
                                    ) {
                                      DXFs[id].symbolLayersByHeight[
                                        key
                                      ].dataSource.add(feature);
                                    }
                                  });
                              }
                            });

                            DXFs[id].BoundsLayer.setOptions({
                              fillOpacity: 0,
                            });
                            for (let key in DXFs[id].symbolLayersByHeight) {
                              if (
                                DXFs[id].symbolLayersByHeight.hasOwnProperty(
                                  key
                                )
                              ) {
                                DXFs[id].symbolLayersByHeight[
                                  key
                                ].layer.setOptions({
                                  visible: true,
                                });
                              }
                            }
                            DXFs[id].Rotate_Point_Layer.setOptions({
                              visible: true,
                            });
                            popup.open();
                            map.getCanvas().style.cursor = "";
                            DXFs[id].reprojectedGeoJSON = rotatedGeoJSON;
                            bbox = turf.bbox(rotatedGeoJSON);
                            DXFs[id].bboxPolygon = turf.bboxPolygon(bbox);
                            DXFs[id].Scale_Points_geojson =
                              createCornerPointsfromPolygon(
                                DXFs[id].bboxPolygon
                              );
                            DXFs[id].Rotate_Point_geojson =
                              calculateTopCenterPoint(DXFs[id].bboxPolygon);
                            topLeftCoordinates = getTopLeftCoordinates(
                              DXFs[id].bboxPolygon.geometry.coordinates[0]
                            );
                            popup.setOptions({
                              position: topLeftCoordinates,
                              pixelOffset: [0, 0],
                            });
                            original_popup_position = topLeftCoordinates;
                            checkPopupInView(popup);

                            DXFs[id].Bounds_dataSource.setShapes(
                              DXFs[id].bboxPolygon
                            );
                            DXFs[id].Scale_Points_dataSource.setShapes(
                              DXFs[id].Scale_Points_geojson
                            );
                            DXFs[id].Rotate_Point_dataSource.setShapes(
                              DXFs[id].Rotate_Point_geojson
                            );

                            bounds = atlas.data.BoundingBox.fromData(
                              DXFs[id].reprojectedGeoJSON
                            );
                            map.setCamera({
                              bounds: bounds,
                              padding: 50,
                              type: "fly",
                              duration: 500,
                            });
                          });
                        }
                      }
                    );





                    // ON MOUSE DOWN ON SCALE POINTS - TRIGGERS SCALING
                    map.events.add(
                      "mousedown",
                      DXFs[id].Scale_Points_Layer,
                      function (e) {
                        firstclickmouseposition = [];
                        firstclickmouseposition.push(e.position[0]);
                        firstclickmouseposition.push(e.position[1]);
                        var scaleFactorModifier = 0.005;
                        if (turf.area(DXFs[id].bboxPolygon) < 200) {
                          scaleFactorModifier = 1;
                        }
                        if (!mouseMoveListenerActive) {
                          // Add mousemove event listener
                          const mouseMoveHandler = function (mouseEvent) {
                            popup.close();
                            map.getCanvas().style.cursor =
                              "url(./images/resize_cursor.png), auto";
                            var moveposition = mouseEvent.position;

                            // Calculate the distance between the first click and the current mouse position
                            var distance = turf.distance(
                              turf.point(firstclickmouseposition),
                              turf.point(moveposition),
                              { units: "meters" }
                            );

                            var scaleFactor =
                              1 + distance * scaleFactorModifier;

                            // Determine if the mouse is on the left or right side of the clicked point
                            if (moveposition[0] < firstclickmouseposition[0]) {
                              scaleFactor = 1 - distance * scaleFactorModifier; // Scale down
                            }
                            //console.log('Scale Factor:', scaleFactor);

                            // Scale the GeoJSON features by the calculated distance
                            DXFs[id].scaledGeoJSON = scaleGeoJSON(
                              DXFs[id].reprojectedGeoJSON,
                              scaleFactor
                            );

                            bbox = turf.bbox(DXFs[id].scaledGeoJSON);
                            DXFs[id].bboxPolygon = turf.bboxPolygon(bbox);
                            DXFs[id].Scale_Points_geojson =
                              createCornerPointsfromPolygon(
                                DXFs[id].bboxPolygon
                              );
                            DXFs[id].Rotate_Point_geojson =
                              calculateTopCenterPoint(DXFs[id].bboxPolygon);

                            topLeftCoordinates = getTopLeftCoordinates(
                              DXFs[id].bboxPolygon.geometry.coordinates[0]
                            );
                            popup.setOptions({
                              position: topLeftCoordinates,
                              pixelOffset: [0, 0],
                            });
                            original_popup_position = topLeftCoordinates;
                            checkPopupInView(popup);

                            // Update the map data sources with the scaled features
                            DXFs[id].Bounds_dataSource.setShapes(
                              DXFs[id].bboxPolygon
                            );
                            DXFs[id].Scale_Points_dataSource.setShapes(
                              DXFs[id].Scale_Points_geojson
                            );
                            DXFs[id].Rotate_Point_dataSource.setShapes(
                              DXFs[id].Rotate_Point_geojson
                            );
                            DXFs[id].Polygons_dataSource.setShapes(
                              DXFs[id].scaledGeoJSON.features.filter(
                                (f) => f.geometry.type === "Polygon"
                              )
                            );
                            DXFs[id].Polylines_dataSource.setShapes(
                              DXFs[id].scaledGeoJSON.features.filter(
                                (f) => f.geometry.type === "LineString"
                              )
                            );

                            Object.keys(DXFs[id].symbolLayersByHeight).forEach(
                              (key) => {
                                DXFs[id].symbolLayersByHeight[
                                  key
                                ].dataSource.clear();
                              }
                            );

                            DXFs[id].scaledGeoJSON.features.forEach(function (
                              feature,
                              index
                            ) {
                              switch (feature.geometry.type) {
                                case "Point":
                                  Object.keys(
                                    DXFs[id].symbolLayersByHeight
                                  ).forEach((key) => {
                                    if (
                                      DXFs[id].symbolLayersByHeight[key]
                                        .symbol_id ===
                                      DXFs[id].reprojectedGeoJSON.features[
                                        index
                                      ].properties.symbol_id
                                    ) {
                                      if (!feature.properties.rotation_ref) {
                                        feature.properties.height =
                                          DXFs[id].reprojectedGeoJSON.features[
                                            index
                                          ].properties.height * scaleFactor;
                                        DXFs[id].symbolLayersByHeight[
                                          key
                                        ].layer.setOptions({
                                          textOptions: {
                                            size: [
                                              "interpolate",
                                              ["exponential", 2],
                                              ["zoom"],
                                              7,
                                              2,
                                              25,
                                              feature.properties.height,
                                            ],
                                          },
                                        });
                                      }
                                      DXFs[id].symbolLayersByHeight[
                                        key
                                      ].dataSource.add(feature);
                                    }
                                  });
                              }
                            });
                          };

                          DXFs[id].BoundsLayer.setOptions({
                            fillOpacity: 0.1,
                          });
                          DXFs[id].BoundsLayer_outline.setOptions({
                            visible: true,
                          });

                          for (let key in DXFs[id].symbolLayersByHeight) {
                            if (
                              DXFs[id].symbolLayersByHeight.hasOwnProperty(key)
                            ) {
                              DXFs[id].symbolLayersByHeight[
                                key
                              ].layer.setOptions({ visible: false });
                            }
                          }
                          map.events.add("mousemove", mouseMoveHandler);
                          mouseMoveListenerActive = true;
                          map.setUserInteraction({ dragPanInteraction: false });

                          // Add a click event listener to remove the mousemove listener
                          map.events.addOnce("mouseup", function () {
                            map.events.remove("mousemove", mouseMoveHandler);
                            map.setUserInteraction({
                              dragPanInteraction: true,
                            });
                            mouseMoveListenerActive = false;
                            DXFs[id].reprojectedGeoJSON =
                              DXFs[id].scaledGeoJSON;
                            bounds = atlas.data.BoundingBox.fromData(
                              DXFs[id].reprojectedGeoJSON
                            );
                            map.setCamera({
                              bounds: bounds,
                              padding: 50,
                              type: "fly",
                              duration: 500,
                            });
                            map.getCanvas().style.cursor = "";
                            DXFs[id].BoundsLayer.setOptions({
                              fillOpacity: 0,
                            });
                            for (let key in DXFs[id].symbolLayersByHeight) {
                              if (
                                DXFs[id].symbolLayersByHeight.hasOwnProperty(
                                  key
                                )
                              ) {
                                DXFs[id].symbolLayersByHeight[
                                  key
                                ].layer.setOptions({ visible: true });
                              }
                            }
                            map.getCanvas().style.cursor = "";
                            popup.open();
                          });
                        }
                      }
                    );





                    // MOUSE DOWN ON DXF - IF DRAG MODE IS ON -> DRAG THE DXF
                    map.events.add(
                      "mousedown",
                      DXFs[id].BoundsLayer,
                      function (e) {
                        // SETS FIRST THE MOUSE COORDINATES AND THE DRAG OFFSET
                        firstclickmouseposition = [];
                        firstclickmouseposition.push(e.position[0]);
                        firstclickmouseposition.push(e.position[1]);
                        previousangle = 0;
                        let initialMousePosition = null;
                        let initialFeatureCenter = null;
                        let dragOffset = null;

                        initialMousePosition = e.position;
                        var bounds = turf.bbox(DXFs[id].reprojectedGeoJSON);
                        var boxbounds = turf.bbox(DXFs[id].bboxPolygon);
                        initialFeatureCenter = [
                          (bounds[0] + bounds[2]) / 2,
                          (bounds[1] + bounds[3]) / 2,
                        ];
                        initialFeatureCenter_bbox = [
                          (boxbounds[0] + boxbounds[2]) / 2,
                          (boxbounds[1] + boxbounds[3]) / 2,
                        ];
                        dragOffset = [
                          initialMousePosition[0] - initialFeatureCenter[0],
                          initialMousePosition[1] - initialFeatureCenter[1],
                        ];
                        dragOffsetbbox = [
                          initialMousePosition[0] -
                            initialFeatureCenter_bbox[0],
                          initialMousePosition[1] -
                            initialFeatureCenter_bbox[1],
                        ];

                        // IF DRAG MODE IS ACTIVATED, STARTS DRAGGING AND UPDATING ALL FEATURES
                        if (Dragisallowed == true) {
                          if (!mouseMoveListenerActive) {
                            // Add mousemove event listener
                            const mouseMoveHandler = function (mouseEvent) {
                              var currentMousePosition = mouseEvent.position;
                              var newCenter = [
                                currentMousePosition[0] - dragOffset[0],
                                currentMousePosition[1] - dragOffset[1],
                              ];
                              var newCenterbbox = [
                                currentMousePosition[0] - dragOffsetbbox[0],
                                currentMousePosition[1] - dragOffsetbbox[1],
                              ];
                              var bounds = turf.bbox(
                                DXFs[id].reprojectedGeoJSON
                              );
                              var boundsbbox = turf.bbox(DXFs[id].bboxPolygon);
                              var currentCenter = [
                                (bounds[0] + bounds[2]) / 2,
                                (bounds[1] + bounds[3]) / 2,
                              ];
                              var currentCenterbbox = [
                                (boundsbbox[0] + boundsbbox[2]) / 2,
                                (boundsbbox[1] + boundsbbox[3]) / 2,
                              ];
                              var dx = newCenter[0] - currentCenter[0];
                              var dy = newCenter[1] - currentCenter[1];
                              DXFs[id].dx = dx;
                              DXFs[id].dy = dy;
                              var dxbbox =
                                newCenterbbox[0] - currentCenterbbox[0];
                              var dybbox =
                                newCenterbbox[1] - currentCenterbbox[1];
                              DXFs[id].bboxPolygon.geometry.coordinates = DXFs[
                                id
                              ].bboxPolygon.geometry.coordinates.map((ring) => {
                                return ring.map((coord) => {
                                  return [coord[0] + dxbbox, coord[1] + dybbox];
                                });
                              });
                              DXFs[id].Bounds_dataSource.setShapes(
                                DXFs[id].bboxPolygon
                              );
                              console.log(DXFs[id].bboxPolygon);
                            };

                            DXFs[id].BoundsLayer.setOptions({
                              fillOpacity: 0.1,
                            });
                            DXFs[id].BoundsLayer_outline.setOptions({
                              visible: true,
                            });
                            for (let key in DXFs[id].symbolLayersByHeight) {
                              if (
                                DXFs[id].symbolLayersByHeight.hasOwnProperty(
                                  key
                                )
                              ) {
                                DXFs[id].symbolLayersByHeight[
                                  key
                                ].layer.setOptions({ visible: false });
                              }
                            }
                            map.getCanvas().style.cursor = "move";
                            map.events.add("mousemove", mouseMoveHandler);
                            mouseMoveListenerActive = true;
                            map.setUserInteraction({
                              dragPanInteraction: false,
                            });

                            // Add a click event listener to remove the mousemove listener
                            map.events.addOnce("mouseup", function (e) {
                              map.events.remove("mousemove", mouseMoveHandler);
                              map.setUserInteraction({
                                dragPanInteraction: true,
                              });
                              mouseMoveListenerActive = false;
                              map.getCanvas().style.cursor = "";

                              DXFs[id].reprojectedGeoJSON.features.forEach(
                                (feature) => {
                                  switch (feature.geometry.type) {
                                    case "Point":
                                      feature.geometry.coordinates[0] +=
                                        DXFs[id].dx;
                                      feature.geometry.coordinates[1] +=
                                        DXFs[id].dy;
                                      break;
                                    case "LineString":
                                      feature.geometry.coordinates =
                                        feature.geometry.coordinates.map(
                                          (coord) => {
                                            return [
                                              coord[0] + DXFs[id].dx,
                                              coord[1] + DXFs[id].dy,
                                            ];
                                          }
                                        );
                                      break;
                                    case "Polygon":
                                      feature.geometry.coordinates =
                                        feature.geometry.coordinates.map(
                                          (ring) => {
                                            return ring.map((coord) => {
                                              return [
                                                coord[0] + DXFs[id].dx,
                                                coord[1] + DXFs[id].dy,
                                              ];
                                            });
                                          }
                                        );
                                      break;
                                  }
                                }
                              );

                              DXFs[id].bboxPolygon = turf.bboxPolygon(
                                turf.bbox(DXFs[id].reprojectedGeoJSON)
                              );

                              DXFs[id].Scale_Points_geojson =
                                createCornerPointsfromPolygon(
                                  DXFs[id].bboxPolygon
                                );
                              DXFs[id].Rotate_Point_geojson =
                                calculateTopCenterPoint(DXFs[id].bboxPolygon);

                              topLeftCoordinates = getTopLeftCoordinates(
                                DXFs[id].bboxPolygon.geometry.coordinates[0]
                              );
                              popup.setOptions({
                                position: topLeftCoordinates,
                                pixelOffset: [0, 0],
                              });
                              original_popup_position = topLeftCoordinates;
                              checkPopupInView(popup);

                              DXFs[id].Bounds_dataSource.setShapes(
                                DXFs[id].bboxPolygon
                              );
                              DXFs[id].Scale_Points_dataSource.setShapes(
                                DXFs[id].Scale_Points_geojson
                              );
                              DXFs[id].Rotate_Point_dataSource.setShapes(
                                DXFs[id].Rotate_Point_geojson
                              );
                              DXFs[id].Polygons_dataSource.setShapes(
                                DXFs[id].reprojectedGeoJSON.features.filter(
                                  (f) => f.geometry.type === "Polygon"
                                )
                              );
                              DXFs[id].Polylines_dataSource.setShapes(
                                DXFs[id].reprojectedGeoJSON.features.filter(
                                  (f) => f.geometry.type === "LineString"
                                )
                              );

                              Object.keys(
                                DXFs[id].symbolLayersByHeight
                              ).forEach((key) => {
                                DXFs[id].symbolLayersByHeight[
                                  key
                                ].dataSource.clear();
                              });

                              DXFs[id].reprojectedGeoJSON.features.forEach(
                                function (feature, index) {
                                  switch (feature.geometry.type) {
                                    case "Point":
                                      Object.keys(
                                        DXFs[id].symbolLayersByHeight
                                      ).forEach((key) => {
                                        if (
                                          DXFs[id].symbolLayersByHeight[key]
                                            .symbol_id ===
                                          feature.properties.symbol_id
                                        ) {
                                          DXFs[id].symbolLayersByHeight[
                                            key
                                          ].dataSource.add(feature);
                                        }
                                      });
                                  }
                                }
                              );

                              DXFs[id].BoundsLayer.setOptions({
                                fillOpacity: 0,
                              });
                              for (let key in DXFs[id].symbolLayersByHeight) {
                                if (
                                  DXFs[id].symbolLayersByHeight.hasOwnProperty(
                                    key
                                  )
                                ) {
                                  DXFs[id].symbolLayersByHeight[
                                    key
                                  ].layer.setOptions({ visible: true });
                                }
                              }
                            });
                          }
                        }
                      }
                    );


                    // MOUSE OVER THE BOUNDS LAYER (DXF) -> CURSOR SET TO POINTER
                    map.events.add("mouseover", DXFs[id].BoundsLayer, () => {
                        map.getCanvas().style.cursor = "pointer";
                    });

                    // MOUSE OUT OF BOUNDS LAYER -> CURSOR SET TO DEFAULT
                    map.events.add("mouseout", DXFs[id].BoundsLayer, () => {
                      map.getCanvas().style.cursor = "";
                    });


                    // CLICK ON BOUNDS LAYER EVENT (BASICALLY CLICKING ON DXF -BOUNDS FILL IS TRANSPARENT-)
                    map.events.add("click", DXFs[id].BoundsLayer, (e) => {
                      current_clicked_ID = id;
                      popup.close();
                      DXFs[id].BoundsLayer_outline.setOptions({
                        visible: true,
                      });
                      // Calculates Top left coordinates for toolbar.
                      topLeftCoordinates = getTopLeftCoordinates(
                        DXFs[id].bboxPolygon.geometry.coordinates[0]
                      );
                      popup.setOptions({
                        content: `
                        <div style="display:flex; flex-direction: row; opacity: 0.8;">
                            <div class="radio-box" style="display:none">
            <input type="radio" id="freeHand" name="mode" value="freeHand" onclick="FreeHand()" checked>
            <label for="freeHand">None</label>
        </div>
        <div>
            <img src="./images/dxf-file.png" height="32">
        </div>
        <div class="radio-box">
            <input type="radio" id="dragMode" name="mode" onclick="dragMode()" value="dragMode">
            <label for="dragMode" style="padding:0px; width:32px; height:32px; margin:0px"><img src="./images/Move_toolbar.png" style="" width="32" height="32" title="Drag"></label>
        </div>

        <div style="display:flex; flex-direction: column;">
        <div class="radio-box">
            <input type="radio" id="rotateMode" name="mode" onclick="rotateMode()" value="rotateMode">
            <label for="rotateMode" style="padding:0px; width:32px; height:32px; margin:0px"><img src="./images/Rotate_toolbar.png" style="" width="32" height="32" title="Rotate (clockwise)"></label>
        </div>

        <div style="display:none; flex-direction: row;" id="rotate_number_div">
        <input type="number" id="rotate_number" style="width:32px; height:32px">
        <button id="rotate_number_button"  onclick="Rotate_from_text1(${id})">Apply</button>
        </div>

        </div>

        <div style="display:flex; flex-direction: column;">
        <div class="radio-box">
            <input type="radio" id="scaleMode" name="mode" onclick="scaleMode()" value="scaleMode">
            <label for="scaleMode" style="padding:0px; width:32px; height:32px; margin:0px"><img src="./images/Scale_toolbar.png" style="" width="32" height="32" title="Scale"></label>
        </div>

        <div style="display:none; flex-direction: row;" id="scale_number_div">
        <input type="number" id="scale_number" style="width:32px; height:32px">
        <button id="scale_number_button" onclick="Scale_from_text(${id})">Apply</button>
        </div>

    </div>
        <div class="radio-box">
            <input type="radio" id="Delete" name="mode" onclick="Delete(${id})" value="Delete">
            <label for="Delete" style="padding:0px; width:32px; height:32px; margin:0px"><img src="./images/Delete_toolbar.png" style="" width="32" height="32" title="Delete (cannot be undone)"></label>
        </div>
        <div class="radio-box">
            <input type="radio" id="Reset" name="mode" onclick="Reset(${id})" value="Reset">
            <label for="Reset" style="padding:0px; width:32px; height:32px; margin:0px"><img src="./images/Reset_toolbar.png" style="" width="32" height="32" title="Reset the size and location to original"></label>
        </div>
        <div class="radio-box">
            <input type="radio" id="Export" name="mode" onclick="Export(${id})" value="Export">
            <label for="Export" style="padding:0px; width:32px; height:32px; margin:0px"><img src="./images/Export_toolbar.png" style="" width="32" height="32" title="Download GEOJSON"></label>
        </div>
        </div>
                        `,
                        position: topLeftCoordinates,
                        pixelOffset: [0, 0],
                      });

                      //Updates popup original position in case the user goes outside popup viewport.
                      original_popup_position = topLeftCoordinates;

                      // FOCUS ON INPUT TEXT BOX ONCE CLICKED
                      document.getElementById("rotate_number").onmousedown =
                        () => {
                          document.getElementById("rotate_number").focus();
                        };
                      document.getElementById("scale_number").onmousedown =
                        () => {
                          document.getElementById("scale_number").focus();
                        };

                        // ENTER KEY IS TRIGGERING APPLY BUTTON, "-" IS REPLACED WITH ""
                      $("#rotate_number").keyup(function (event) {
                        if (event.keyCode === 13) {
                          $("#rotate_number_button").click();
                        }
                        if (event.key === "-") {
                          this.value = parseFloat(this.value.replace("-", ""));
                        }
                      });
                      $("#scale_number").keyup(function (event) {
                        if (event.keyCode === 13) {
                          $("#scale_number_button").click();
                        }
                        if (event.key === "-") {
                          this.value = parseFloat(this.value.replace("-", ""));
                        }
                      });
                      popup.open();
                      $(".popup-arrow").remove();
                      $(".popup-container").css("background", "#f0ffff00");
                      $(".popup-content-container").css(
                        "background",
                        "#f0ffff00"
                      );
                      checkPopupInView(popup);
                    });

                    // SETS THE _old GEOJSON FOR RESET
                    DXFs[id + "_old"] = {};
                    DXFs[id + "_old"].reprojectedGeoJSON = JSON.stringify(
                      DXFs[id].reprojectedGeoJSON
                    );
                    DXFs[id + "_old"].bboxPolygon = JSON.stringify(
                      DXFs[id].bboxPolygon
                    );
                    DXFs[id + "_old"].Scale_Points_geojson = JSON.stringify(
                      DXFs[id].Scale_Points_geojson
                    );
                    DXFs[id + "_old"].Rotate_Point_geojson = JSON.stringify(
                      DXFs[id].Rotate_Point_geojson
                    );

                  })(currentID);
                };
              },
            },
            cancel: {
              text: "Cancel",
              action: function () {
                // Close the dialog
              },
            },
          },
        });
      });


      // Replace with your Azure Maps subscription key
      const subscriptionKey = "dShQV3q6fJFViDOFs22xN1uY5SMIcRSq6kAfkvAq8eU";

      // Initialize the map
      const map = new atlas.Map("map", {
        center: [-122.33, 47.6], // Default center location [longitude, latitude]
        zoom: 10, // Default zoom level
        language: "en-US",
        authOptions: {
          authType: "subscriptionKey",
          subscriptionKey: subscriptionKey,
        },
      });

      // Attaches popup to actual map
      popup.attach(map);



      // HIDES DXF BOUNDS + CLOSES POPUP + FREE HAND MODE UPON CLICKING ON MAP
      map.events.add("click", (e) => {
        for (let id in DXFs) {
          if (!id.includes("old")) {
            if (DXFs.hasOwnProperty(id)) {
              DXFs[id].BoundsLayer_outline.setOptions({
                visible: false,
              });
            }
          }
        }
        popup.close();
        $("#freeHand").click();
      });


      // CHECKS POPUP LOCATION AND UPDATES IT UPON ZOOM/MOVE
      map.events.add("zoomend", function () {
        checkPopupInView(popup);
      });
      map.events.add("moveend", function () {
        checkPopupInView(popup);
      });



      // Add the map control once the map resources are ready
      map.events.add("ready", function () {
        // Add a zoom control to the map
        map.controls.add(new atlas.control.ZoomControl(), {
          position: "top-right",
        });

        // Initialize the Drawing Manager
        drawingManager = new atlas.drawing.DrawingManager(map, {
          toolbar: new atlas.control.DrawingToolbar({
            position: "top-right",
            style: "dark",
          }),
        });

        Drawing_dataSource = drawingManager.getSource();

        map.events.add("drawingcomplete", function (e) {
          //console.log('Drawing completed:', e);
        });

        map.imageSprite.add("scale_icon", "./images/square.png");
        map.imageSprite.add("rotate_icon", "./images/rotate.png");
      });





      /**
      * Rotate a GeoJSON object. This is a convenience function to rotate a GeoJSON object by a given degree.
      * 
      * @param geojson - The GeoJSON object to rotate. Must be a projection of a point on the Earth
      * @param degree - The degree of rotation in degrees
      * 
      * @return { Object
      */
      function rotateGeoJSON(geojson, degree) {
        return turf.transformRotate(geojson, degree);
      }




      /**
      * Scale a GeoJSON object by a factor. This is useful for zooming and rotating polygons and linestrings
      * 
      * @param geojson - The GeoJSON to be scaled
      * @param scale - The factor to scale the coordinates by
      * 
      * @return { Object } Scaled GeoJSON as a JS
      */
      function scaleGeoJSON(geojson, scale) {
        scaledGeoJSON = JSON.parse(JSON.stringify(geojson)); // Deep copy of the geojson
        var centroid = turf.centroid(geojson).geometry.coordinates;

        /**
        * Scales and centers a GeoJSON Feature to the bounding box of the Map
        * 
        * @param feature - GeoJSON Feature to be scaled
        * 
        * @return { Object } Feature with coordinates
        */
        scaledGeoJSON.features = scaledGeoJSON.features.map(function (feature) {
          // Computes the coordinates of the feature.
          if (feature.geometry.type === "Polygon") {
            feature.geometry.coordinates = feature.geometry.coordinates.map(
              /**
              * Scale a ring to the center of the map. This is useful for drawing circles on the map
              * 
              * @param ring - Array of coordinates to scale
              * 
              * @return { Array } Array of coordinates scaled to the center of the
              */
              function (ring) {
                /**
                * @param coord
                * 
                * @return { Array } Scaled
                */
                return ring.map(function (coord) {
                  var scaledCoord = [
                    centroid[0] + (coord[0] - centroid[0]) * scale,
                    centroid[1] + (coord[1] - centroid[1]) * scale,
                  ];
                  return scaledCoord;
                });
              }
            );
          // Scale the feature s coordinates to the nearest point.
          } else if (feature.geometry.type === "LineString") {
            feature.geometry.coordinates = feature.geometry.coordinates.map(
              /**
              * @param coord
              * 
              * @return { Array } Scaled
              */
              function (coord) {
                var scaledCoord = [
                  centroid[0] + (coord[0] - centroid[0]) * scale,
                  centroid[1] + (coord[1] - centroid[1]) * scale,
                ];
                return scaledCoord;
              }
            );
          // If the feature has a Point then the coordinates of the point will be scaled to the centroid of the feature.
          } else if (feature.geometry.type === "Point") {
            var coord = feature.geometry.coordinates;
            var scaledCoord = [
              centroid[0] + (coord[0] - centroid[0]) * scale,
              centroid[1] + (coord[1] - centroid[1]) * scale,
            ];
            feature.geometry.coordinates = scaledCoord;
          }
          return feature;
        });

        return scaledGeoJSON;
      }



      // ----------------- INTERACTION MODES -------------

      //Scale Mode
      function scaleMode() {
        DXFs[current_clicked_ID].Scale_Points_Layer.setOptions({
          visible: true,
        });
        DXFs[current_clicked_ID].Rotate_Point_Layer.setOptions({
          visible: false,
        });
        Dragisallowed = false;
        $("#rotate_number_div").css("display", "none");
        $("#scale_number_div").css("display", "flex");
      }

      //Rotate Mode
      function rotateMode() {
        DXFs[current_clicked_ID].Scale_Points_Layer.setOptions({
          visible: false,
        });
        DXFs[current_clicked_ID].Rotate_Point_Layer.setOptions({
          visible: true,
        });
        Dragisallowed = false;
        $("#rotate_number_div").css("display", "flex");
        $("#scale_number_div").css("display", "none");
      }

      // Drag Mode
      function dragMode() {
        DXFs[current_clicked_ID].Scale_Points_Layer.setOptions({
          visible: false,
        });
        DXFs[current_clicked_ID].Rotate_Point_Layer.setOptions({
          visible: false,
        });
        Dragisallowed = true;
        $("#rotate_number_div").css("display", "none");
        $("#scale_number_div").css("display", "none");
      }

      // FreeHand Mode
      function FreeHand() {
        DXFs[current_clicked_ID].Scale_Points_Layer.setOptions({
          visible: false,
        });
        DXFs[current_clicked_ID].Rotate_Point_Layer.setOptions({
          visible: false,
        });
        Dragisallowed = false;
        $("#rotate_number_div").css("display", "none");
        $("#scale_number_div").css("display", "none");
      }

// ----------------- // INTERACTION MODES -------------


      /**
      * Resets DXF to original state.
      */
      function Reset(id) {
        DXFs[id].Bounds_dataSource.setShapes(
          JSON.parse(DXFs[id + "_old"].bboxPolygon)
        );
        DXFs[id].bboxPolygon = JSON.parse(DXFs[id + "_old"].bboxPolygon);
        DXFs[id].Scale_Points_dataSource.setShapes(
          JSON.parse(DXFs[id + "_old"].Scale_Points_geojson)
        );
        DXFs[id].Scale_Points_geojson = JSON.parse(
          DXFs[id + "_old"].Scale_Points_geojson
        );
        DXFs[id].Rotate_Point_dataSource.setShapes(
          JSON.parse(DXFs[id + "_old"].Rotate_Point_geojson)
        );
        DXFs[id].Rotate_Point_geojson = JSON.parse(
          DXFs[id + "_old"].Rotate_Point_geojson
        );
        DXFs[id].Polygons_dataSource.setShapes(
          JSON.parse(DXFs[id + "_old"].reprojectedGeoJSON).features.filter(
            (f) => f.geometry.type === "Polygon"
          )
        );
        DXFs[id].Polylines_dataSource.setShapes(
          JSON.parse(DXFs[id + "_old"].reprojectedGeoJSON).features.filter(
            (f) => f.geometry.type === "LineString"
          )
        );

        Object.keys(DXFs[id].symbolLayersByHeight).forEach((key) => {
          DXFs[id].symbolLayersByHeight[key].dataSource.clear();
        });

        JSON.parse(DXFs[id + "_old"].reprojectedGeoJSON).features.forEach(
          /**
          * @param feature - index The index of the in the data source
          * @param index
          */
          function (feature, index) {
            // Add a feature to the data source
            switch (feature.geometry.type) {
              case "Point":
                Object.keys(DXFs[id].symbolLayersByHeight).forEach((key) => {
                  // Add feature to symbol layer
                  if (
                    DXFs[id].symbolLayersByHeight[key].symbol_id ===
                    feature.properties.symbol_id
                  ) {
                    DXFs[id].symbolLayersByHeight[key].dataSource.add(feature);
                    DXFs[id].symbolLayersByHeight[key].layer.setOptions({
                      textOptions: {
                        size: [
                          "interpolate",
                          ["exponential", 2],
                          ["zoom"],
                          7,
                          2,
                          25,
                          feature.properties.height,
                        ],
                      },
                    });
                  }
                });
            }
          }
        );

        DXFs[id].reprojectedGeoJSON = JSON.parse(
          DXFs[id + "_old"].reprojectedGeoJSON
        );
        DXFs[id].rotation_angle = 0;
        popup.close();
        DXFs[id].Scale_Points_Layer.setOptions({
          visible: false,
        });
        DXFs[id].Rotate_Point_Layer.setOptions({
          visible: false,
        });
        topLeftCoordinates = getTopLeftCoordinates(
          DXFs[id].bboxPolygon.geometry.coordinates[0]
        );
        popup.setOptions({
          position: topLeftCoordinates,
          pixelOffset: [0, 0],
        });
        original_popup_position = topLeftCoordinates;
        checkPopupInView(popup);
        popup.open();
        Dragisallowed = false;
        bounds = atlas.data.BoundingBox.fromData(DXFs[id].reprojectedGeoJSON);
        map.setCamera({
          bounds: bounds,
          padding: 50,
          type: "fly",
          duration: 500,
        });
      }




      /**
      * Deletes a feature from the map. Confirmation is shown to the user before deleting the feature
      * 
      * @param id - The id of the feature to
      */
      function Delete(id) {
        $.confirm({
          title: "Confirm Deletion",
          content: "Are you sure you want to delete this feature?",
          buttons: {
            confirm: function () {
              map.layers.remove(DXFs[id].polygonLayer);
              map.layers.remove(DXFs[id].polylineLayer);

              Object.keys(DXFs[id].symbolLayersByHeight).forEach((key) => {
                DXFs[id].symbolLayersByHeight[key].dataSource.clear();
                map.layers.remove(DXFs[id].symbolLayersByHeight[key].layer);
              });
              map.layers.remove(DXFs[id].BoundsLayer);
              map.layers.remove(DXFs[id].BoundsLayer_outline);
              map.layers.remove(DXFs[id].Scale_Points_Layer);
              map.layers.remove(DXFs[id].Rotate_Point_Layer);
              popup.close();
            },
            cancel: function () {
              console.log("Deletion canceled");
            },
          },
        });
      }



      /**
      * Scale and rotate features from text. This function is called when user clicks on scale button
      * 
      * @param id - id of div to
      */
      function Scale_from_text(id) {
        $("#rotate_number_div").css("display", "none");
        $("#scale_number_div").css("display", "none");
        scale = $("#scale_number").val();
        //console.log(scale);
        DXFs[id].scaledGeoJSON = scaleGeoJSON(
          DXFs[id].reprojectedGeoJSON,
          scale
        );

        bbox = turf.bbox(DXFs[id].scaledGeoJSON);
        DXFs[id].bboxPolygon = turf.bboxPolygon(bbox);
        DXFs[id].Scale_Points_geojson = createCornerPointsfromPolygon(
          DXFs[id].bboxPolygon
        );
        DXFs[id].Rotate_Point_geojson = calculateTopCenterPoint(
          DXFs[id].bboxPolygon
        );
        //console.log('Scaled GeoJSON Features:', DXFs[id].scaledGeoJSON);
        topLeftCoordinates = getTopLeftCoordinates(
          DXFs[id].bboxPolygon.geometry.coordinates[0]
        );
        popup.setOptions({
          position: topLeftCoordinates,
          pixelOffset: [0, 0],
        });
        original_popup_position = topLeftCoordinates;
        checkPopupInView(popup);

        // Update the map data sources with the scaled features
        DXFs[id].Bounds_dataSource.setShapes(DXFs[id].bboxPolygon);
        DXFs[id].Scale_Points_dataSource.setShapes(
          DXFs[id].Scale_Points_geojson
        );
        DXFs[id].Rotate_Point_dataSource.setShapes(
          DXFs[id].Rotate_Point_geojson
        );
        DXFs[id].Polygons_dataSource.setShapes(
          DXFs[id].scaledGeoJSON.features.filter(
            (f) => f.geometry.type === "Polygon"
          )
        );
        DXFs[id].Polylines_dataSource.setShapes(
          DXFs[id].scaledGeoJSON.features.filter(
            (f) => f.geometry.type === "LineString"
          )
        );

        Object.keys(DXFs[id].symbolLayersByHeight).forEach((key) => {
          DXFs[id].symbolLayersByHeight[key].dataSource.clear();
        });

        /**
        * @param feature - index Index of the in reprojectedGeoJSON. features
        * @param index
        */
        DXFs[id].scaledGeoJSON.features.forEach(function (feature, index) {
          // This method is used to add a feature to the data source
          switch (feature.geometry.type) {
            case "Point":
              Object.keys(DXFs[id].symbolLayersByHeight).forEach((key) => {
                // Add feature to symbolLayersByHeight
                if (
                  DXFs[id].symbolLayersByHeight[key].symbol_id ===
                  DXFs[id].reprojectedGeoJSON.features[index].properties
                    .symbol_id
                ) {
                  // Set feature. properties. height to the feature. properties. height if not set. properties. rotation_ref is set to true.
                  if (!feature.properties.rotation_ref) {
                    feature.properties.height =
                      DXFs[id].reprojectedGeoJSON.features[index].properties
                        .height * scale;
                    DXFs[id].symbolLayersByHeight[key].layer.setOptions({
                      textOptions: {
                        size: [
                          "interpolate",
                          ["exponential", 2],
                          ["zoom"],
                          7,
                          2,
                          25,
                          feature.properties.height,
                        ],
                      },
                    });
                  }
                  DXFs[id].symbolLayersByHeight[key].dataSource.add(feature);
                }
              });
          }
        });

        DXFs[id].reprojectedGeoJSON = DXFs[id].scaledGeoJSON;
        bounds = atlas.data.BoundingBox.fromData(DXFs[id].reprojectedGeoJSON);
        map.setCamera({
          bounds: bounds,
          padding: 50,
          type: "fly",
          duration: 500,
        });
      }




      /**
      * Rotate features from text field by angle. Rotation is done in two steps : 1. Get reprojectedGeoJSON 2. Rotate BBOX ( Polygons Polylines )
      * 
      * @param id - The id of the form
      * @param angle - The angle to rotate
      */
      function Rotate_from_text(id, angle) {
        // Get the angle of the rotate number
        if (angle === undefined) {
          angle = $("#rotate_number").val();
        }
        rotatedGeoJSON = rotateGeoJSON(
          DXFs[id].reprojectedGeoJSON,
          parseFloat(angle)
        );
        rotatedBBOX = rotateGeoJSON(DXFs[id].bboxPolygon, parseFloat(angle));
        DXFs[id].Polygons_dataSource.setShapes(
          rotatedGeoJSON.features.filter((f) => f.geometry.type === "Polygon")
        );
        DXFs[id].Polylines_dataSource.setShapes(
          rotatedGeoJSON.features.filter(
            (f) => f.geometry.type === "LineString"
          )
        );
        Object.keys(DXFs[id].symbolLayersByHeight).forEach((key) => {
          DXFs[id].symbolLayersByHeight[key].dataSource.clear();
        });
        rotatedGeoJSON.features.forEach(function (feature, index) {
          // Add a feature to the data source
          switch (feature.geometry.type) {
            case "Point":
              feature.properties.rotation =
                feature.properties.rotation + parseFloat(angle);
              Object.keys(DXFs[id].symbolLayersByHeight).forEach((key) => {
                // Add a feature to the symbol layer
                if (
                  DXFs[id].symbolLayersByHeight[key].symbol_id ===
                  feature.properties.symbol_id
                ) {
                  DXFs[id].symbolLayersByHeight[key].dataSource.add(feature);
                }
              });
          }
        });
        DXFs[id].reprojectedGeoJSON = rotatedGeoJSON;
        bbox = turf.bbox(rotatedGeoJSON);
        DXFs[id].bboxPolygon = turf.bboxPolygon(bbox);
        DXFs[id].Scale_Points_geojson = createCornerPointsfromPolygon(
          DXFs[id].bboxPolygon
        );
        DXFs[id].Rotate_Point_geojson = calculateTopCenterPoint(
          DXFs[id].bboxPolygon
        );
        topLeftCoordinates = getTopLeftCoordinates(
          DXFs[id].bboxPolygon.geometry.coordinates[0]
        );
        popup.setOptions({
          position: topLeftCoordinates,
          pixelOffset: [0, 0],
        });
        original_popup_position = topLeftCoordinates;
        checkPopupInView(popup);

        DXFs[id].Bounds_dataSource.setShapes(DXFs[id].bboxPolygon);
        DXFs[id].Scale_Points_dataSource.setShapes(
          DXFs[id].Scale_Points_geojson
        );
        DXFs[id].Rotate_Point_dataSource.setShapes(
          DXFs[id].Rotate_Point_geojson
        );
        bounds = atlas.data.BoundingBox.fromData(DXFs[id].reprojectedGeoJSON);
        map.setCamera({
          bounds: bounds,
          padding: 50,
          type: "fly",
          duration: 500,
        });
      }

      /**
      * Rotate from text 1. This function is called when the user clicks on the rotate button
      * 
      * @param id - The id of the DXF object
      * 
      * @return { undefined } No rotation or scaling is performed. The value of the rotation_ref is
      */
      function Rotate_from_text1(id) {
        $("#rotate_number_div").css("display", "none");
        $("#scale_number_div").css("display", "none");
        /**
        * @param feature - index The index of the in the array.
        * @param index
        * 
        * @return { Boolean } True if the feature was processed false otherwise
        */
        DXFs[id].reprojectedGeoJSON.features.forEach(function (feature, index) {
          // This function is called when the geometry is a Point or Point
          switch (feature.geometry.type) {
            case "Point":
              // Rotate the feature to the rotation
              if (feature.properties.rotation_ref === true) {
                Rotate_from_text(id, 360 - feature.properties.rotation);
                Rotate_from_text(id);
                return;
              }
          }
        });
      }



      /**
      * Checks if the popup is in view. If it is the nearest point on the map will be used for checking
      * 
      * @param popup - Popup to check in
      */
      function checkPopupInView(popup) {
        var mapBounds = map.getCamera().bounds;
        var viewportPolygon = turf.bboxPolygon(mapBounds);

        var popupPosition = original_popup_position;
        var point = turf.point([popupPosition[0], popupPosition[1]]);
        onepointofboundpolygonisinsideviewport = false;

        // Checks if the polygon is inside the viewport polygon.
        if (
          turf.booleanIntersects(
            viewportPolygon,
            turf.lineString(
              DXFs[current_clicked_ID].bboxPolygon.geometry.coordinates[0]
            )
          )
        ) {
          onepointofboundpolygonisinsideviewport = true;
        }
        // If the polygon is inside the viewport this method will be called when the polygon is inside the viewport.
        if (
          turf.booleanPointInPolygon(
            turf.point(map.getCamera().center),
            turf.polygon(
              DXFs[current_clicked_ID].bboxPolygon.geometry.coordinates
            )
          )
        ) {
          onepointofboundpolygonisinsideviewport = true;
        }

        // popup. open popup if the point is inside viewportPolygon
        if (
          !turf.booleanPointInPolygon(point, viewportPolygon) &&
          onepointofboundpolygonisinsideviewport
        ) {
          var nearestPoint = turf.nearestPointOnLine(
            turf.lineString(viewportPolygon.geometry.coordinates[0]),
            point
          );
          popup.setOptions({
            position: nearestPoint.geometry.coordinates,
            pixelOffset: [0, 50],
          });
          // Close the popup if it is open.
          if (popup.isOpen()) {
            popup.close();
            popup.open();
          }
        } else {
          popup.setOptions({
            position: original_popup_position,
            pixelOffset: [0, -2],
          });
          // Close the popup if it is open.
          if (popup.isOpen()) {
            popup.close();
            popup.open();
          }
        }
      }



      /**
      * Round GeoJSON coordinates to 1e8. This is useful for reducing lat / lon values in a geojson object that is going to be written to disk.
      * 
      * @param geojson - The geojson to round. Must be a FeatureCollection or a Feature.
      * 
      * @return { Feature } The rounded geojson object. If it's a FeatureCollection or a Feature it will be returned unaltered
      */
      function roundGeoJSONCoordinates(geojson) {
        /**
        * Rounds a number to 1e8. This is useful for numbers that are too large to fit in a 64 - bit number.
        * 
        * @param value - The number to round. Must be > 0.
        * 
        * @return { number } The rounded number. If the number is too large it will be rounded
        */
        function round(value) {
          return Math.round(value * 1e8) / 1e8;
        }

        /**
        * Round coordinates to integer. This is useful for determining which coordinates are extremely close to each other and can be used to make them more easily readable
        * 
        * @param coords - Coordinates to round or array of coordinates
        * 
        * @return { Array } Rounded coordinates or array of rounded
        */
        function roundCoords(coords) {
          // Returns an array of coordinates.
          if (Array.isArray(coords[0])) {
            return coords.map(roundCoords);
          }
          return coords.map(round);
        }

        /**
        * Process a GeoJSON feature. Rounds coordinates to match WGS84 ellipsoid
        * 
        * @param feature - GeoJSON feature to process
        */
        function processFeature(feature) {
          // Round the feature s coordinates to the nearest nearest point.
          if (feature.geometry) {
            feature.geometry.coordinates = roundCoords(
              feature.geometry.coordinates
            );
          }
        }

        // Processes the geojson. features. forEach function
        if (geojson.type === "FeatureCollection") {
          geojson.features.forEach(processFeature);
        // Process the geojson if it is a Feature
        } else if (geojson.type === "Feature") {
          processFeature(geojson);
        }

        return geojson;
      }



      /**
      * Exports a DXF file to a GeoJSON file and links to it in the page
      * 
      * @param id - The id of the DXF
      */
      function Export(id) {
        // Download a DXF from a reprojected GeoJSON string.
        if (DXFs[id].reprojectedGeoJSON) {
          const geojson = DXFs[id].reprojectedGeoJSON;
          geojsonStr = JSON.stringify(geojson);
          geojson_final = JSON.stringify(
            roundGeoJSONCoordinates(JSON.parse(geojsonStr)),
            null,
            2
          );

          // Create a Blob from the JSON string
          const blob = new Blob([geojson_final], { type: "application/json" });

          // Create a link element
          const link = document.createElement("a");

          // Set the download attribute with a filename
          link.download = `${DXFs[id].filename.replace(".dxf", "")}.geojson`;

          // Create a URL for the Blob and set it as the href attribute
          link.href = URL.createObjectURL(blob);

          // Append the link to the body (required for Firefox)
          document.body.appendChild(link);

          // Trigger the download by simulating a click
          link.click();

          // Remove the link from the document
          document.body.removeChild(link);
        } else {
          console.error("Invalid DXF id or reprojectedGeoJSON not found.");
        }
      }



      /**
      * Calculates the centroid of a GeoJSON FeatureCollection. This is useful for determining the area of a polygon that is being plotted
      * 
      * @param featureCollection - GeoJSON FeatureCollection to calculate the centroid of
      * 
      * @return { Array } Centroid of the featureCollection in the form [ x y
      */
      function calculateCentroid(featureCollection) {
        let totalX = 0;
        let totalY = 0;
        let totalPoints = 0;

        featureCollection.features.forEach((feature) => {
          feature.geometry.coordinates.forEach((coord) => {
            // Calculate the total X and Y coordinates of the points in the polygon or polygon.
            if (Array.isArray(coord[0])) {
              // Handle Polygon or MultiLineString
              coord.forEach((ring) => {
                ring.forEach((point) => {
                  totalX += point[0];
                  totalY += point[1];
                  totalPoints++;
                });
              });
            } else {
              // Handle Point or LineString
              totalX += coord[0];
              totalY += coord[1];
              totalPoints++;
            }
          });
        });

        return [totalX / totalPoints, totalY / totalPoints];
      }



      // Function to rotate a point around a pivot
      function rotatePoint(point, angle, pivot) {
        const rad = (angle * Math.PI) / 180; // Convert angle to radians
        const cos = Math.cos(rad);
        const sin = Math.sin(rad);

        const x = point[0] - pivot[0];
        const y = point[1] - pivot[1];

        const xNew = x * cos - y * sin + pivot[0];
        const yNew = x * sin + y * cos + pivot[1];

        return [xNew, yNew];
      }

      
      /**
      * Rotate a feature collection by a given angle around the centre of the featureCollection.
      * 
      * @param featureCollection - The featureCollection to be rotated. Must be a GeoJSON FeatureCollection
      * @param angle - The angle to rotate by in radian
      * 
      * @return { GeoJSON }
      */
      function rotateFeatureCollection(featureCollection, angle) {
        const centroid = calculateCentroid(featureCollection);

        return {
          type: "FeatureCollection",
          features: featureCollection.features.map((feature) => {
            let newCoordinates;
            // This method is used to create a new feature.
            switch (feature.geometry.type) {
              case "Point":
                newCoordinates = rotatePoint(
                  feature.geometry.coordinates,
                  angle,
                  centroid
                );
                break;
              case "LineString":
                newCoordinates = feature.geometry.coordinates.map((coord) =>
                  rotatePoint(coord, angle, centroid)
                );
                break;
              case "Polygon":
                newCoordinates = feature.geometry.coordinates.map((ring) =>
                  ring.map((coord) => rotatePoint(coord, angle, centroid))
                );
                break;
              case "MultiPoint":
                newCoordinates = feature.geometry.coordinates.map((coord) =>
                  rotatePoint(coord, angle, centroid)
                );
                break;
              case "MultiLineString":
                newCoordinates = feature.geometry.coordinates.map((line) =>
                  line.map((coord) => rotatePoint(coord, angle, centroid))
                );
                break;
              case "MultiPolygon":
                newCoordinates = feature.geometry.coordinates.map((polygon) =>
                  polygon.map((ring) =>
                    ring.map((coord) => rotatePoint(coord, angle, centroid))
                  )
                );
                break;
              default:
                throw new Error("Unsupported geometry type");
            }

            return {
              ...feature,
              geometry: {
                ...feature.geometry,
                coordinates: newCoordinates,
              },
            };
          }),
        };
      }



      /**
      * Calculate the mean height of a GeoJSON FeatureCollection. This is used to calculate the height of an object that is a collection of points with height = 0.
      * 
      * @param geojson - The geojson feature collection to process. Must be a FeatureCollection with at least one Point
      * 
      * @return { number } The mean height
      */
      function calculateMeanHeight(geojson) {
        let totalHeight = 0;
        let pointCount = 0;

        geojson.features.forEach((feature) => {
          // Calculate the total height of the geometry
          if (
            feature.geometry.type === "Point" &&
            feature.properties.height !== undefined
          ) {
            totalHeight += feature.properties.height;
            pointCount++;
          }
        });

        // Returns the number of points in the image
        if (pointCount === 0) {
          return 0; // Return 0 if there are no point features with height
        }

        return totalHeight / pointCount;
      }