const SCHEMA = {
    "type": "array", 
    "minItems": 1, 
    "items": {
        "type": "object", 
        "required": ["nodeNumber", "startDate", "type", "name", "nodeCoordinateX", "nodeCoordinateY", "junctions"], 
        "properties": {
            "nodeNumber": {
                "type": "integer", 
                "minimum": 1
            }, 
            "startDate": {
                "type": "string", 
                "pattern": "^\\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])T(2[0-3]|[01][0-9]):[0-5][0-9]:[0-5][0-9]\\.\\d{3}[+-](0[0-9]|1[0-9]|2[0-3]):[0-5][0-9]$"
            }, 
            "type": {
                "type": "integer", 
                "minimum": 1, 
                "maximum": 18
            }, 
            "name": {
                "type": ["string",  "null"]
            }, 
            "nodeCoordinateX": {
                "type": "integer", 
                "minimum": 0, 
                "maximum": 1000000
            }, 
            "nodeCoordinateY": {
                "type": "integer", 
                "minimum": 0, 
                "maximum": 1000000
            }, 
            "junctions": {
                "type": "array", 
                "minItems": 1, 
                "items": {
                    "type": "object", 
                    "required": ["startDate", "junctionNumber", "junctionCoordinateX",  "junctionCoordinateY", "road_address"], 
                    "properties": {
                        "startDate": {
                            "type": "string", 
                            "pattern": "^\\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])T(2[0-3]|[01][0-9]):[0-5][0-9]:[0-5][0-9]\\.\\d{3}[+-](0[0-9]|1[0-9]|2[0-3]):[0-5][0-9]$"
                        }, 
                        "junctionNumber": {
                            "type": "integer", 
                            "minimum": 1
                        },
                        "junctionCoordinateX": {
                            "type": "integer", 
                            "minimum": 0, 
                            "maximum": 1000000
                        }, 
                        "junctionCoordinateY": {
                            "type": "integer", 
                            "minimum": 0, 
                            "maximum": 1000000
                        }, 
                        "road_address": {
                            "type": "array", 
                            "minItems": 1, 
                            "items": {
                                "type": "object", 
                                "required": ["roadNumber", "roadNumber", "track", "addrM", "beforeAfter"], 
                                "properties": {
                                    "roadNumber": {
                                        "type": "integer", 
                                        "minimum": 1, 
                                        "maximum": 99999
                                    }, 
                                    "roadPartNumber": {
                                        "type": "integer", 
                                        "minimum": 1, 
                                        "maximum": 999
                                    }, 
                                    "track": {
                                        "type": "integer", 
                                        "minimum": 0, 
                                        "maximum": 2
                                    }, 
                                    "addrM": {
                                        "type": "integer", 
                                        "minimum": 0
                                    }, 
                                    "before_after": {
                                        "type": "string", 
                                        "enum": ["E", "J"]
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

module.exports = SCHEMA;
