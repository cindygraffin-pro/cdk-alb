import { CfnOutput, Duration, Stack } from 'aws-cdk-lib' ;
import { AutoScalingGroup } from 'aws-cdk-lib/aws-autoscaling';
import { AmazonLinuxGeneration, AmazonLinuxImage, InstanceClass, InstanceSize, InstanceType, UserData, Vpc } from 'aws-cdk-lib/aws-ec2';
import { ApplicationLoadBalancer, ListenerAction, ListenerCondition } from 'aws-cdk-lib/aws-elasticloadbalancingv2';


class CdkAlbStack extends Stack {

  constructor(scope, id, props) {
    super(scope, id, props);

    const vpc = new Vpc(this, 'vpc', {natGateways: 1})

    const alb = new ApplicationLoadBalancer(this, 'alb', {
      vpc,
      internetFacing: true
    });

    const listener = alb.addListener('Listener', {
      port: 80,
      open: true
    })

    const userData = UserData.forLinux();
    userData.addCommands(
      'sudo su',
      'yum install -y httpd',
      'systemctl start httpd',
      'systemctl enable httpd',
      'echo "<h1>Hello World from $(hostname -f)</h1>" > /var/www/html/index.html'
    );

    // auto scale group
    const asg = new AutoScalingGroup(this, 'asg', {
      vpc,
      instanceType: InstanceType.of(
        InstanceClass.BURSTABLE2,
        InstanceSize.MICRO
      ),
      machineImage: new AmazonLinuxImage({
        generation: AmazonLinuxGeneration.AMAZON_LINUX_2
      }),
      userData,
      minCapacity: 2,
      maxCapacity: 3
    })

    listener.addTargets('default-target', {
      port: 80,
      targets: [asg],
      healthCheck: {
        path: '/',
        unhealthyThresholdCount: 2,
        healthyThresholdCount: 5,
        interval: Duration.seconds(30)
      }
    });

    listener.addAction('/static', {
      priority: 5,
      conditions: [ListenerCondition.pathPatterns(['/static'])],
      action: ListenerAction.fixedResponse(200, {
        contentType: 'text/html',
        messageBody: '<h1>Static ALB Response </h1>'
      })
    })

    asg.scaleOnRequestCount('requests-per-minute', {
      targetRequestsPerMinute: 60
    });

    asg.scaleOnCpuUtilization('cpu-util-scaling', {
      targetUtilizationPercent: 75
    })

    new CfnOutput(this, 'albDNS', {
      value: alb.loadBalancerDnsName
    })
  }
}

export { CdkAlbStack }
