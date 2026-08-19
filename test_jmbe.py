import jpype
jpype.startJVM(classpath=["lib/jmbe/api/build/libs/jmbe-api-1.0.9.jar", "lib/jmbe/codec/build/libs/jmbe-1.0.9.jar"])
c = jpype.JClass("jmbe.JMBEAudioLibrary")().getAudioConverter("AMBE 3600 x 2450")
print([m.getName() for m in c.getClass().getMethods()])
